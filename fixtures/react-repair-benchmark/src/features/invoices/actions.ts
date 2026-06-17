"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { INVOICE_CACHE_TAG } from "./cacheKeys";

export async function saveInvoice(formData: FormData) {
  const invoiceId = formData.get("invoiceId");

  revalidatePath("/invoices");
  revalidateTag(INVOICE_CACHE_TAG);

  return {
    ok: true,
    invoiceId: String(invoiceId ?? ""),
  };
}
