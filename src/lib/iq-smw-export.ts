/**
 * SMW (Selections / Materials / Works) document export.
 * Generates a structured Excel workbook for client selections sign-off.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export async function exportSMWDocument(jobId: string): Promise<{ blob: Blob; filename: string }> {
  const { data: job, error } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  if (error) throw new Error(`Failed to load job: ${error.message}`);

  const { data: items } = await supabase
    .from("module_items")
    .select("module_id, label, extracted_value, approved_value, unit, description, value_source")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true });

  const wb = XLSX.utils.book_new();

  // Cover sheet
  const coverRows = [
    ["JENNIAN HOMES — Selections / Materials / Works"],
    [],
    ["Job Number", job.job_number],
    ["Client", job.client_name],
    ["Address", job.address],
    ["Date", new Date().toLocaleDateString("en-NZ")],
    [],
    ["This document lists the standard selections and material allowances for your new home."],
    ["Please review each item and sign off to confirm your acceptance."],
  ];
  const wsCover = XLSX.utils.aoa_to_sheet(coverRows);
  wsCover["!cols"] = [{ wch: 24 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsCover, "SMW Cover");

  // Selections sheet
  const dataRows: (string | number | null)[][] = [
    ["Module", "Item", "Jennian Standard", "Unit", "Client Selection", "Notes"],
  ];
  for (const item of items ?? []) {
    dataRows.push([
      (item.module_id as string).replace("iq-", "").toUpperCase(),
      item.label as string,
      (item.approved_value ?? item.extracted_value ?? "—") as string,
      (item.unit ?? "") as string,
      "",
      (item.description ?? "") as string,
    ]);
  }
  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData["!cols"] = [{ wch: 14 }, { wch: 38 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsData, "Selections");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const surname = (job.client_name as string).split(" ").pop() || "Client";
  const filename = `${job.job_number}-SMW-${surname}.xlsx`;
  return { blob, filename };
}
