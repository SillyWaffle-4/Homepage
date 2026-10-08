import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, RotateCcw } from "lucide-react";

const parseTime = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  let hour = Number(match[1]);
  if (hour > 0 && hour < 6) hour += 12;
  return hour * 60 + Number(match[2]);
};

const rangeMinutes = value => {
  const [start, end] = String(value || "").split("-");
  return [parseTime(start), parseTime(end)];
};

const formatRemaining = minutes => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

export default function SchoolPeriodsWidget({ date, now }) {
  const [schedule, setSchedule] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const loadSchedule = useCallback(async signal => {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(`https://four11.eastsideprep.org/epsnet/schedule_for_date?date=${encodeURIComponent(date)}`, { signal });
      if (!response.ok) throw new Error("The school schedule is unavailable right now.");
      const data = await response.json();
      setSchedule(data);
      setStatus("ready");
    } catch (loadError) {
      if (loadError.name === "AbortError") return;
      setError(loadError.message || "Could not load today’s schedule.");
      setStatus("error");
    }
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSchedule(controller.signal);
    return () => controller.abort();
  }, [loadSchedule]);

  const periods = schedule?.periods ?? [];
  const minuteNow = now.getHours() * 60 + now.getMinutes();
  const activeIndex = useMemo(() => periods.findIndex(period => {
    const [start, end] = rangeMinutes(period.times);
    return start !== null && end !== null && minuteNow >= start && minuteNow < end;
  }), [periods, minuteNow]);
  const nextIndex = periods.findIndex(period => {
    const [start] = rangeMinutes(period.times);
    return start !== null && start > minuteNow;
  });
  const schoolColor = schedule?.color ? `#${String(schedule.color).replace(/^#/, "")}` : "#6658e8";
  const colorStyle = { "--school-color": schoolColor, "--school-tint": `${schoolColor}18` };
  const activePeriod = activeIndex >= 0 ? periods[activeIndex] : null;
  const nextPeriod = nextIndex >= 0 ? periods[nextIndex] : null;
  const activeEnd = activePeriod ? rangeMinutes(activePeriod.times)[1] : null;
  const nextStart = nextPeriod ? rangeMinutes(nextPeriod.times)[0] : null;
  const remaining = activeEnd === null ? null : Math.max(0, activeEnd - minuteNow);
  const untilNext = nextStart === null ? null : Math.max(0, nextStart - minuteNow);

  return <div className="school-periods-widget" style={colorStyle}>
    <header className="school-periods-heading">
      <div><p className="label">School schedule</p><h2>{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h2></div>
      <CalendarDays size={21}/>
    </header>
    {status === "loading" && <p className="school-periods-state">Loading today’s periods…</p>}
    {status === "error" && <div className="school-periods-state school-periods-error"><p role="status">{error}</p><button type="button" onClick={() => void loadSchedule()}><RotateCcw size={14}/> Try again</button></div>}
    {status === "ready" && (schedule?.schedule_day ? <>
      <div className="school-day-badge school-periods-day" title={schedule.activity_day || schedule.schedule_day}>{schedule.schedule_day}{schedule.activity_day ? ` · ${schedule.activity_day}` : ""}</div>
      <section className="school-current-period" aria-live="polite">
        <div className="school-current-icon"><Clock3 size={20}/></div>
        <div className="school-current-copy">
          <span>{activePeriod ? "You’re currently in" : nextPeriod ? "Up next" : "School day"}</span>
          <strong>{activePeriod ? `Period ${activePeriod.period}` : nextPeriod ? `Period ${nextPeriod.period}` : periods.length ? "Complete" : "No periods scheduled"}</strong>
          <small>{activePeriod ? `${formatRemaining(remaining)} left · ends ${activePeriod.times.split("-")[1]}` : nextPeriod ? `${formatRemaining(untilNext)} until it starts · ${nextPeriod.times}` : "That’s it for today."}</small>
        </div>
        {activePeriod && nextPeriod && <ArrowRight className="school-next-arrow" size={17}/>}
      </section>
      {schedule.activity_day && <p className="school-periods-activity">{schedule.activity_day}</p>}
      <div className="school-period-list" aria-label="All periods today">
        {periods.map((period, index) => <article className={`school-period-row ${index === activeIndex ? "active" : ""} ${index < activeIndex ? "past" : ""}`} key={`${period.period}-${period.times}`}>
          <span className="school-period-dot"/>
          <strong>{period.period === "O" ? "Office hours" : `Period ${period.period}`}</strong>
          <time>{period.times}</time>
          {index === activeIndex && <small>Now</small>}
          {index === nextIndex && activeIndex < 0 && <small>Next</small>}
        </article>)}
      </div>
    </> : <div className="school-periods-state"><p>No school schedule is posted for today.</p>{schedule?.activity_day && <small>{schedule.activity_day}</small>}</div>)}
  </div>;
}
