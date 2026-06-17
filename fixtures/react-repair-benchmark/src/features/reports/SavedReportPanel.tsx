import { Button } from "../../components/ui/Button";
import { createReportRunner } from "./reportActions";

export function SavedReportPanel() {
  const reportId = "revenue-weekly";

  return (
    <section aria-label="Saved reports">
      <Button type="button" onClick={createReportRunner(reportId)}>
        Run saved report
      </Button>
    </section>
  );
}
