type ReportTableProps = {
  readonly pageSize: number;
  readonly reports: readonly {
    readonly id: string;
    readonly title: string;
  }[];
};

export function ReportTable({ pageSize, reports }: ReportTableProps) {
  return (
    <section aria-label="Report table">
      <p>Showing {pageSize} reports per page</p>
      {reports.map((report) => (
        <article key={report.id}>{report.title}</article>
      ))}
    </section>
  );
}
