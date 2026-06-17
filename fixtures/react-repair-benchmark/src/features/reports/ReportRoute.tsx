import { useSearchParams } from "react-router-dom";

import { ReportTable } from "./ReportTable";

type Report = {
  readonly id: string;
  readonly title: string;
};

const reports: readonly Report[] = [
  { id: "report-1", title: "Bookings" },
  { id: "report-2", title: "Revenue" },
];

export function ReportRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = searchParams.get("pageSize") ?? "25";

  function handlePageSizeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("limit", event.target.value);
    setSearchParams(nextParams);
  }

  return (
    <section aria-label="Reports workspace">
      <label>
        Page size
        <select aria-label="Page size" value={pageSize} onChange={handlePageSizeChange}>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </label>
      <ReportTable pageSize={Number(pageSize)} reports={reports} />
    </section>
  );
}
