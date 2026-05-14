import os
import json
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client
import anthropic

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are Marcus Aurelius — the market intelligence agent for Jennian Homes Manawatū, New Zealand's top residential builder in the Palmerston North / Manawatū region.

You receive REAL scraped data from realestate.co.nz, oneroof.co.nz, and competitor builder websites. Your job is to turn this data into a sharp, actionable daily intelligence brief for Haydon Christian, the Managing Director.

RULES:
- Only report what the data shows. No fabrication. No estimates presented as facts.
- If data is thin (scraper got little), say so honestly and report what you have.
- Be direct. Haydon reads this at 6am. No fluff, no consultant language.
- Always end with ONE clear action Haydon should take today.
- Competitors: GJ Gardner, Signature Homes, Japac, Latitude Homes.
- Jennian's key subdivisions: Awa Park Feilding, Kelvin Grove PN, Fitzherbert PN, Highbury PN.
- Jennian's price range: ~$750k–$1.1M H&L packages.

OUTPUT FORMAT:
Return a JSON object with exactly these keys:
{
  "html_content": "Full HTML of the brief (inline styles only, dark theme: bg #0a0c0f, text #e8eaed, accent green #00e5a0, amber #f5a623, red #ff4757, blue #185FA5). Include sections: PRIORITY ALERTS, COMPETITOR WATCH, MARKET PULSE, TODAY'S ONE ACTION. Make it email-safe HTML.",
  "text_content": "Plain text version of the brief for email fallback",
  "summary": "One sentence summary of today's brief",
  "alert_count": <integer>,
  "new_listing_count": <integer>,
  "price_change_count": <integer>
}

Return ONLY the JSON object. No markdown fences. No preamble."""


def get_todays_data() -> dict:
    """Pull today's changes and active listings from Supabase."""
    cutoff_24h = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    cutoff_7d = (datetime.utcnow() - timedelta(days=7)).isoformat()

    new_listings = (
        supabase.table("listing_changes")
        .select("*, listings(*)")
        .eq("change_type", "new_listing")
        .gte("detected_at", cutoff_24h)
        .execute()
    )
    price_changes = (
        supabase.table("listing_changes")
        .select("*, listings(*)")
        .in_("change_type", ["price_reduction", "price_increase"])
        .gte("detected_at", cutoff_7d)
        .execute()
    )
    removed = (
        supabase.table("listing_changes")
        .select("*, listings(*)")
        .eq("change_type", "removed")
        .gte("detected_at", cutoff_7d)
        .execute()
    )
    active_competitors = (
        supabase.table("listings")
        .select("*")
        .eq("status", "active")
        .neq("source", "jennian")
        .execute()
    )
    active_jennian = (
        supabase.table("listings")
        .select("*")
        .eq("status", "active")
        .eq("source", "jennian")
        .execute()
    )

    return {
        "new_listings_24h": new_listings.data or [],
        "price_changes_7d": price_changes.data or [],
        "removed_7d": removed.data or [],
        "active_competitors": active_competitors.data or [],
        "active_jennian": active_jennian.data or [],
        "scan_date": date.today().isoformat(),
    }


def generate_brief(data: dict) -> dict:
    """Call the Anthropic API to generate the HTML brief from real scraped data."""
    user_message = f"""Today's date: {data['scan_date']}

REAL DATA FROM TODAY'S SCAN:

New listings detected (last 24h): {json.dumps(data['new_listings_24h'], indent=2, default=str)}

Price changes detected (last 7d): {json.dumps(data['price_changes_7d'], indent=2, default=str)}

Listings removed/sold (last 7d): {json.dumps(data['removed_7d'], indent=2, default=str)}

All active competitor listings: {json.dumps(data['active_competitors'], indent=2, default=str)}

Jennian active listings: {json.dumps(data['active_jennian'], indent=2, default=str)}

Generate the brief. Report only what the data shows."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if the model adds them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def save_brief(brief: dict):
    """Upsert the generated brief to Supabase."""
    today = date.today().isoformat()
    supabase.table("daily_briefs").upsert(
        {
            "brief_date": today,
            "html_content": brief["html_content"],
            "text_content": brief["text_content"],
            "summary": brief["summary"],
            "alert_count": brief.get("alert_count", 0),
            "new_listing_count": brief.get("new_listing_count", 0),
            "price_change_count": brief.get("price_change_count", 0),
            "generated_at": datetime.utcnow().isoformat(),
        },
        on_conflict="brief_date",
    ).execute()
    print(f"Brief saved for {today}.")


def send_brief_email(brief: dict):
    """Send the brief to all active email recipients via Resend (optional)."""
    import httpx

    resend_key = os.getenv("RESEND_API_KEY")
    if not resend_key:
        print("No RESEND_API_KEY — skipping email send.")
        return

    recipients = (
        supabase.table("email_recipients").select("*").eq("active", True).execute()
    )
    for recipient in recipients.data or []:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": "007 Intel <intel@jennian.co.nz>",
                "to": recipient["email"],
                "subject": f"Jennian 007 Brief — {brief['brief_date']}",
                "html": brief["html_content"],
                "text": brief["text_content"],
            },
        )
        print(f"  Sent to {recipient['email']}: {resp.status_code}")


if __name__ == "__main__":
    print("Pulling today's data...")
    data = get_todays_data()
    print(
        f"  {len(data['new_listings_24h'])} new listings, "
        f"{len(data['price_changes_7d'])} price changes, "
        f"{len(data['active_competitors'])} active competitor listings."
    )
    print("Generating brief with Claude...")
    brief = generate_brief(data)
    save_brief(brief)
    send_brief_email(brief)
    print("Done.")
