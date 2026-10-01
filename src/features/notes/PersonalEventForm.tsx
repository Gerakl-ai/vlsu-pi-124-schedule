import { CalendarPlus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toLocalDateTimeValue } from "./noteDeadline";
import { deletePersonalEvent, savePersonalEvent, type PersonalEvent } from "./personalEvents";

export function PersonalEventForm({ date, event, onClose }: { date: Date; event?: PersonalEvent; onClose: () => void }) {
  const initial = new Date(date);
  initial.setHours(12, 0, 0, 0);
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(toLocalDateTimeValue(event?.start ?? initial.toISOString()));
  const [end, setEnd] = useState(toLocalDateTimeValue(event?.end ?? new Date(initial.getTime() + 3600000).toISOString()));
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <form className="personal-event-form" onSubmit={(submission) => {
    submission.preventDefault();
    if (!start || !end || new Date(end) <= new Date(start)) {
      setError("Окончание должно быть позже начала");
      return;
    }
    try {
      savePersonalEvent({ id: event?.id ?? crypto.randomUUID(), title: title.trim(), start: new Date(start).toISOString(), end: new Date(end).toISOString(), location: location.trim(), description });
      onClose();
    } catch { setError("Не удалось сохранить событие. Проверьте время и свободное место на устройстве."); }
  }}>
    <header><h3>{event ? "Событие" : "Новое событие"}</h3><button type="button" onClick={onClose} aria-label="Отменить редактирование события"><X size={20} /></button></header>
    <label>Название<input required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <div className="personal-event-times">
      <label>Начало<input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label>Окончание<input required type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
    </div>
    <label>Место<input maxLength={240} value={location} onChange={(e) => setLocation(e.target.value)} /></label>
    <label>Описание<textarea rows={4} maxLength={10000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <footer>
      {event && <button type="button" className="event-delete" onClick={() => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        try { deletePersonalEvent(event.id); onClose(); } catch { setError("Не удалось удалить событие"); }
      }}><Trash2 size={18} />{confirmDelete ? "Подтвердить удаление" : "Удалить"}</button>}
      <button type="submit"><CalendarPlus size={18} />Сохранить</button>
    </footer>
  </form>;
}
