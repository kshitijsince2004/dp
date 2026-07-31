/**
 * Standard A4 Print-Readiness Setup Helper for ExcelJS Worksheets
 */
export function applyPrintSetup(ws, options = {}) {
  ws.pageSetup = {
    paperSize: 9, // A4 paper size
    orientation: options.orientation || 'landscape',
    fitToWidth: 1,  // Fit all columns onto 1 page width
    fitToHeight: 0, // Allow data rows to flow naturally across pages
    fitToPage: true,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
    printTitlesRow: options.printTitlesRow || '1:4',
    showGridLines: true,
  };
  ws.views = [{ showGridLines: true }];
}
