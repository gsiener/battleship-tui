export function createHeader(pollInterval: number, isError: boolean): string {
  const errorIndicator = isError ? "⚠️ " : ""
  return `🚢 BATTLESHIP TOURNAMENT MONITOR                    ${errorIndicator}⏱️ Auto: ${pollInterval}s  🔄`
}
