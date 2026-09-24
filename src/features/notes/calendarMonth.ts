export function shiftCalendarMonth(selectedDate: Date, offset: number) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + offset;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(selectedDate.getDate(), lastDay));
}
