"use client";

import { useRouter } from "next/navigation";
import { saveInvoice } from "./actions";
import { InvoiceToolbar } from "./InvoiceToolbar";

type InvoiceClientProps = {
  readonly exportBuilder?: () => string;
  readonly submitAction?: typeof saveInvoice;
  readonly formatters?: {
    readonly label: () => string;
  };
  readonly presenter?: unknown;
};

export function InvoiceClient(_props: InvoiceClientProps) {
  const router = useRouter();

  return (
    <section aria-label="Invoice editor">
      <InvoiceToolbar />
      <form action={saveInvoice}>
        <input type="hidden" name="invoiceId" value="inv-1" />
        <button type="submit" aria-label="Submit invoice">
          Submit invoice
        </button>
        <button formAction={saveInvoice} aria-label="Approve invoice">
          Approve invoice
        </button>
      </form>
      <button
        type="button"
        aria-label="Sync invoice"
        onClick={async () => {
          await saveInvoice(new FormData());
          router.refresh();
        }}
      >
        Sync invoice
      </button>
    </section>
  );
}
