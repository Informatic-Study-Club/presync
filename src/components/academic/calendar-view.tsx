"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import idLocale from "@fullcalendar/react/locales/id";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";

export type CalendarItem = {
  id: string;
  title: string;
  /** ISO datetime untuk sesi, "YYYY-MM-DD" untuk event sepanjang hari. */
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  url?: string;
};

// Kalender tampilan saja; data sudah disaring di server sesuai cakupan anggota.
export function CalendarView({ items }: { items: CalendarItem[] }) {
  return (
    <div data-color-scheme="dark" className="presync-calendar">
      <FullCalendar
        plugins={[dayGridPlugin, listPlugin, classicThemePlugin]}
        locale={idLocale}
        timeZone="Asia/Jakarta"
        initialView="dayGridMonth"
        headerToolbar={{ start: "prev,next today", center: "title", end: "dayGridMonth,listMonth" }}
        height="auto"
        firstDay={1}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        events={items.map((item) => ({
          id: item.id,
          title: item.title,
          start: item.start,
          end: item.end,
          allDay: item.allDay,
          color: item.color,
          url: item.url,
        }))}
      />
    </div>
  );
}
