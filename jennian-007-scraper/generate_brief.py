import os
import json
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client
import anthropic

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are the Jennian 007 market intelligence agent for Jennian Homes Manawatū — New Zealand's top residential builder in the Palmerston North / Manawatū region. You generate a daily intelligence brief for Haydon Christian, Managing Director.

RULES:
- Only report what the data shows. No fabrication. No estimates presented as facts.
- If data is thin, say so honestly and report what you have.
- Be direct. Haydon reads this at 6am. No fluff.
- Always end with ONE clear action Haydon should take today.
- Competitors: GJ Gardner, Signature Homes, Japac, Latitude Homes.
- Key subdivisions: Awa Park Feilding, Kelvin Grove PN, Fitzherbert PN, Highbury PN, Tamakuku Terrace Whakarongo.
- Jennian's price range: ~$750k–$1.1M H&L packages.
- Jennian brand colour: #E71B23.
- Jennian is preferred builder at Tamakuku Terrace alongside Japac — monitor Japac activity there closely.

OUTPUT: Return a JSON object with exactly these keys:
{
  "html_content": "Full HTML brief with inline styles. Dark theme: bg #0a0c0f, text #e8eaed, accent #E71B23, green #00e5a0, amber #f5a623. Sections: PRIORITY ALERTS, COMPETITOR WATCH, MARKET PULSE, TODAY'S ONE ACTION. Email-safe HTML.",
  "text_content": "Plain text version for email fallback",
  "summary": "One sentence summary of today's brief",
  "alert_count": 0,
  "new_listing_count": 0,
  "price_change_count": 0
}
Return ONLY the JSON. No markdown. No preamble."""

def get_todays_data():
    cutoff_24h = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    cutoff_7d = (datetime.utcnow() - timedelta(days=7)).isoformat()
    new_listings = supabase.table("listing_changes").select("*, listings(*)").eq("change_type", "new_listing").gte("detected_at", cutoff_24h).execute()
    price_changes = supabase.table("listing_changes").select("*, listings(*)").in_("change_type", ["price_reduction", "price_increase"]).gte("detected_at", cutoff_7d).execute()
    removed = supabase.table("listing_changes").select("*, listings(*)").eq("change_type", "removed").gte("detected_at", cutoff_7d).execute()
    active_competitors = supabase.table("listings").select("*").eq("status", "active").neq("source", "jennian").execute()
    active_jennian = supabase.table("listings").select("*").eq("status", "active").eq("source", "jennian").execute()
    return {
        "new_listings_24h": new_listings.data or [],
        "price_changes_7d": price_changes.data or [],
        "removed_7d": removed.data or [],
        "active_competitors": active_competitors.data or [],
        "active_jennian": active_jennian.data or [],
        "scan_date": date.today().isoformat()
    }

def generate_brief(data: dict) -> dict:
    user_message = f"""Today's date: {data['scan_date']}

REAL DATA FROM TODAY'S SCAN:
New listings (last 24h): {json.dumps(data['new_listings_24h'], indent=2, default=str)}
Price changes (last 7d): {json.dumps(data['price_changes_7d'], indent=2, default=str)}
Listings removed/sold (last 7d): {json.dumps(data['removed_7d'], indent=2, default=str)}
Active competitor listings: {json.dumps(data['active_competitors'], indent=2, default=str)}
Jennian active listings: {json.dumps(data['active_jennian'], indent=2, default=str)}

Generate the brief. Report only what the data shows."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}]
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())

def save_brief(brief: dict):
    today = date.today().isoformat()
    supabase.table("daily_briefs").upsert({
        "brief_date": today,
        "html_content": brief["html_content"],
        "text_content": brief["text_content"],
        "summary": brief["summary"],
        "alert_count": brief.get("alert_count", 0),
        "new_listing_count": brief.get("new_listing_count", 0),
        "price_change_count": brief.get("price_change_count", 0),
        "generated_at": datetime.utcnow().isoformat()
    }, on_conflict="brief_date").execute()
    print(f"Brief saved for {today}.")

def send_email(brief: dict):
    resend_key = os.getenv("RESEND_API_KEY")
    if not resend_key:
        print("No RESEND_API_KEY — skipping email.")
        return
    import httpx
    today = date.today().strftime("%a %d %b")
    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
        json={
            "from": "007 Intel <intel@jennian.co.nz>",
            "to": "haydon.christian@jennian.co.nz",
            "subject": f"Jennian 007 Brief — {today}",
            "html": brief["html_content"],
            "text": brief["text_content"]
        }
    )
    print(f"Email sent: {response.status_code}")

if __name__ == "__main__":
    print("Pulling today's data...")
    data = get_todays_data()
    print(f"  {len(data['new_listings_24h'])} new listings, {len(data['price_changes_7d'])} price changes, {len(data['active_competitors'])} active competitor listings.")
    print("Generating brief...")
    brief = generate_brief(data)
    save_brief(brief)
    send_email(brief)
    print("Done.")
