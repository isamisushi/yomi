import { ClientChart } from "@acme/client-widgets";
import ClientSparkline from "@acme/client-widgets/sparkline";
import { ClientMetric } from "@acme/client-widgets/widgets/metric";
import { VirtualGauge } from "@acme/virtual-widgets";
import { Suspense } from "react";

import { saveInvoice } from "../../features/invoices/actions";
import { INVOICE_CACHE_TAG } from "../../features/invoices/cacheKeys";
import { InvoiceClient } from "../../features/invoices/InvoiceClient";

type Invoice = {
  readonly id: string;
  readonly status: string;
};

class InvoicePresenter {}

export async function InvoicePage() {
  const response = await fetch("https://api.example.com/invoices", {
    next: {
      tags: [INVOICE_CACHE_TAG],
    },
  });
  const invoices = (await response.json()) as readonly Invoice[];
  const buildInvoiceExport = () => "csv";
  const invoiceFormatters = {
    label: () => "Invoice",
  };

  return (
    <section aria-label="Invoices page">
      <Suspense fallback={<p>Loading invoice editor...</p>}>
        <InvoiceClient
          exportBuilder={buildInvoiceExport}
          submitAction={saveInvoice}
          formatters={invoiceFormatters}
          presenter={new InvoicePresenter()}
        />
      </Suspense>
      <ClientChart />
      <ClientSparkline />
      <ClientMetric />
      <VirtualGauge />
      {invoices.map((invoice) => (
        <article key={invoice.id}>{invoice.status}</article>
      ))}
    </section>
  );
}
