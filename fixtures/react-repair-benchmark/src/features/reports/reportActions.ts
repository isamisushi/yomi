export function createReportRunner(reportId: string) {
  return async function runSavedReport() {
    await fetch(`/api/reports/${reportId}/run`, {
      method: "POST",
    });
  };
}
