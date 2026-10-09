import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Plus, Trash2, Edit3, Check, X, Tag, Settings,
  ChevronLeft, ChevronRight, Grid, LayoutList, Layers, RotateCw
} from 'lucide-react';

// Default Category Palette
const INITIAL_CATEGORIES = [
  { id: 'general', name: 'General', bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
  { id: 'work', name: 'Work', bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-300' },
  { id: 'personal', name: 'Personal', bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300' },
  { id: 'health', name: 'Health', bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-300' },
  { id: 'urgent', name: 'Urgent', bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' },
];

const PALETTES = [
  { name: 'Indigo', bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-300' },
  { name: 'Emerald', bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300' },
  { name: 'Amber', bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300' },
  { name: 'Rose', bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' },
  { name: 'Purple', bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-300' },
  { name: 'Sky', bg: 'bg-sky-100', text: 'text-sky-900', border: 'border-sky-300' },
];

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateOrdinal = value => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};
const recurrenceOccursOn = (task, targetDate, schoolSchedules) => {
  if (!task.date || targetDate < task.date) return false;
  const rule = String(task.recurring || 'none').toLowerCase();
  if (rule === 'none') return targetDate === task.date;
  const daysSinceStart = dateOrdinal(targetDate) - dateOrdinal(task.date);
  const dayOfWeek = new Date(`${targetDate}T12:00:00`).getDay();
  if (rule === 'daily') return true;
  if (rule === 'every-other-day' || rule === 'every-2-days') return daysSinceStart % 2 === 0;
  if (rule.startsWith('every-') && rule.endsWith('-days')) {
    const interval = Number(rule.slice(6, -5));
    if (Number.isInteger(interval) && interval > 0) return daysSinceStart % interval === 0;
  }
  if (rule === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (rule === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
  if (rule === 'weekly') return daysSinceStart % 7 === 0;
  if (rule === 'every-2-weeks' || rule === 'biweekly') return daysSinceStart % 14 === 0;
  if (rule === 'every-4-weeks') return daysSinceStart % 28 === 0;
  const monthsSinceStart = (Number(targetDate.slice(0, 4)) - Number(task.date.slice(0, 4))) * 12 + Number(targetDate.slice(5, 7)) - Number(task.date.slice(5, 7));
  if (rule === 'monthly' || /^every-\d+-months$/.test(rule)) {
    const interval = rule === 'monthly' ? 1 : Number(rule.match(/\d+/)[0]);
    return monthsSinceStart % interval === 0 && new Date(`${targetDate}T12:00:00`).getDate() === new Date(`${task.date}T12:00:00`).getDate();
  }
  if (rule === 'yearly') {
    const target = new Date(`${targetDate}T12:00:00`);
    const origin = new Date(`${task.date}T12:00:00`);
    return target.getMonth() === origin.getMonth() && target.getDate() === origin.getDate();
  }
  if (['a-d', 'd-a', 'h-e', 'e-h'].includes(rule)) {
    const day = String(schoolSchedules[targetDate]?.schedule_day || '').toLowerCase().replace(/[^a-z]/g, '');
    return day === rule.replace('-', '');
  }
  const weeklyDays = /^weekly:([0-6](?:,[0-6])*)$/.exec(rule);
  if (weeklyDays) return weeklyDays[1].split(',').map(Number).includes(dayOfWeek);
  return false;
};
const scheduleStartHour = times => {
  const hour = Number(times?.split('-')[0]?.split(':')[0]);
  return hour > 0 && hour < 6 ? hour + 12 : hour;
};
const scheduleTimeMinutes = value => {
  const [hourPart, minutePart] = String(value || '').split(':');
  let hour = Number(hourPart);
  if (!Number.isFinite(hour) || !Number.isFinite(Number(minutePart))) return null;
  if (hour > 0 && hour < 6) hour += 12;
  return hour * 60 + Number(minutePart);
};
const scheduleRangeMinutes = times => {
  const [start, end] = String(times || '').split('-');
  return [scheduleTimeMinutes(start), scheduleTimeMinutes(end)];
};
const schoolEventsForHour = (schedule, hour, now) => {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (Number(hour.slice(0, 2)) !== now.getHours()) return [];
  const active = (schedule?.periods || []).find(period => {
    const [start, end] = scheduleRangeMinutes(period.times);
    return start !== null && end !== null && start <= currentMinutes && currentMinutes < end;
  });
  return active ? [active] : [];
};

export default function PlannerDashboard({ name = "Aiden", tasks, setTasks }) {

  const savedCalendarView = localStorage.getItem('planner-calendar-default-view');
  const initialCalendarView = ['day', 'week', 'month'].includes(savedCalendarView) ? savedCalendarView : 'week';

  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('planner_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  const [viewMode, setViewMode] = useState(initialCalendarView); // 'day' | 'week' | 'month'
  const [defaultView, setDefaultView] = useState(initialCalendarView);
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [schoolSchedules, setSchoolSchedules] = useState({});

  // Modal States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');

  useEffect(() => {
    localStorage.setItem('planner_categories', JSON.stringify(categories));
  }, [categories]);

  // Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Category Map Helper
  const categoryMap = useMemo(() => {
    return categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat }), {});
  }, [categories]);

  const scheduleDates = useMemo(() => {
    if (viewMode === 'day') return [dateKey(currentDate)];
    if (viewMode === 'week') {
      const start = new Date(currentDate);
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return dateKey(date);
      });
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => dateKey(new Date(year, month, index + 1)));
  }, [currentDate, viewMode]);

  useEffect(() => {
    const controller = new AbortController();
    const missingDates = scheduleDates.filter(date => !schoolSchedules[date]);
    if (!missingDates.length) return () => controller.abort();

    Promise.all(missingDates.map(async date => {
      try {
        const response = await fetch(`https://four11.eastsideprep.org/epsnet/schedule_for_date?date=${date}`, { signal: controller.signal });
        if (!response.ok) return null;
        const schedule = await response.json();
        return schedule?.date && schedule?.schedule_day ? [date, schedule] : null;
      } catch (error) {
        if (error.name !== 'AbortError') return null;
        return null;
      }
    })).then(results => {
      const received = Object.fromEntries(results.filter(Boolean));
      if (Object.keys(received).length) setSchoolSchedules(current => ({ ...current, ...received }));
    });

    return () => controller.abort();
  }, [scheduleDates, schoolSchedules]);

  // Date Nav
  const navigateDate = (amount) => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + amount);
    else if (viewMode === 'week') d.setDate(d.getDate() + (amount * 7));
    else if (viewMode === 'month') d.setMonth(d.getMonth() + amount);
    setCurrentDate(d);
  };
  const chooseDefaultView = mode => {
    setDefaultView(mode);
    setViewMode(mode);
    localStorage.setItem('planner-calendar-default-view', mode);
  };

  // Task Actions
  const handleSaveTask = (taskData) => {
    if (editingTask) {
      setTasks(current => current.map(t => t.id === editingTask.id ? { ...t, ...taskData, title: taskData.title, text: taskData.title } : t));
    } else {
      const newTask = {
        id: Date.now().toString(),
        ...taskData,
        title: taskData.title,
        text: taskData.title,
        date: dateKey(currentDate),
        completed: false,
        done: false
      };
      setTasks(current => [...current, newTask]);
    }
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleQuickAdd = (e) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    const newTask = {
      id: Date.now().toString(),
      title: quickTaskTitle.trim(),
      text: quickTaskTitle.trim(),
      time: null,
      duration: 30,
      date: dateKey(currentDate),
      categoryId: 'general',
      completed: false,
      done: false,
      recurring: 'none'
    };
    setTasks(current => [...current, newTask]);
    setQuickTaskTitle('');
  };

  const toggleTaskComplete = (id, occurrenceDate) => {
    setTasks(current => current.map(t => {
      if (t.id !== id) return t;
      if (occurrenceDate && t.recurring && t.recurring !== 'none') {
        const completedDates = new Set(t.completedDates || []);
        if (completedDates.has(occurrenceDate)) completedDates.delete(occurrenceDate);
        else completedDates.add(occurrenceDate);
        return { ...t, completedDates: [...completedDates] };
      }
      return { ...t, completed: !t.completed, done: !t.completed };
    }));
  };

  const deleteTask = (id) => {
    setTasks(current => current.filter(t => t.id !== id));
  };

  const updateTaskCategory = (taskId, categoryId) => {
    setTasks(current => current.map(t => t.id === taskId ? { ...t, categoryId } : t));
  };

  // Category Actions
  const handleAddCategory = (name, palette) => {
    const newCat = {
      id: `cat_${Date.now()}`,
      ...palette,
      name
    };
    setCategories(current => [...current, newCat]);
  };

  const handleDeleteCategory = (catId) => {
    if (catId === 'general') return; // Cannot delete General
    // Reassign affected tasks to 'general'
    setTasks(current => current.map(t => t.categoryId === catId ? { ...t, categoryId: 'general' } : t));
    setCategories(current => current.filter(c => c.id !== catId));
  };

  const handleRenameCategory = (catId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setCategories(current => current.map(category => category.id === catId ? { ...category, name: trimmedName } : category));
  };

  // Drag and Drop
  const handleDragStart = (e, task) => {
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDropSlot = (e, targetDate, targetTime) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    setTasks(current => current.map(t => {
      if (String(t.id) === taskId) {
        return {
          ...t,
          date: targetDate,
          time: targetTime
        };
      }
      return t;
    }));
  };

  // Hours Grid Range: 6:00 AM to 11:00 PM
  const hours = useMemo(() => {
    const list = [];
    for (let h = 6; h <= 23; h++) {
      list.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return list;
  }, []);

  const filteredTasks = useMemo(() => {
    if (selectedCategory === 'all') return tasks;
    return tasks.filter(t => t.categoryId === selectedCategory);
  }, [tasks, selectedCategory]);
  const tasksByDate = useMemo(() => Object.fromEntries(scheduleDates.map(date => [
    date,
    filteredTasks.filter(task => recurrenceOccursOn(task, date, schoolSchedules)).map(task => {
      const recurring = task.recurring && task.recurring !== 'none';
      const completed = recurring ? (task.completedDates || []).includes(date) : Boolean(task.completed ?? task.done);
      return { ...task, date, occurrenceDate: date, completed, done: completed };
    }),
  ])), [filteredTasks, scheduleDates, schoolSchedules]);
  const getTasksForDate = date => tasksByDate[date] || [];

  return (
    <div className="planner-page text-slate-800 p-4 sm:p-6 md:p-8">
      <div className="relative max-w-7xl mx-auto space-y-6">
        
        {/* Header Dashboard Banner */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-white">
          <div>
            <div className="text-xs uppercase tracking-widest text-indigo-200 font-semibold mb-1">Your Space</div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {name || 'there'}.</h1>
            <p className="text-indigo-100 text-sm mt-1">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="glass-button px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-white/30 transition"
            >
              <Settings className="w-4 h-4" /> Categories
            </button>
            <button 
              onClick={() => { setEditingTask(null); setIsTaskModalOpen(true); }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" /> Add Task
            </button>
          </div>
        </header>

        {/* Top Cards Row */}
        <div className="planner-summary grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Clock & Date Widget */}
          <div className="glass-card rounded-2xl p-6 text-slate-800 flex flex-col justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Clock & Date</div>
            <div>
              <div className="text-4xl font-extrabold tracking-tight">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span className="text-lg text-slate-400 font-normal ml-2">
                  {currentTime.getSeconds().toString().padStart(2, '0')}
                </span>
              </div>
              <div className="text-sm font-medium text-slate-600 mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Quick Add / Unscheduled Tasks Widget */}
          <div className="glass-card rounded-2xl p-6 text-slate-800 md:col-span-2 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Task List</span>
              <span className="text-xs font-semibold text-slate-500">
                {tasks.filter(t => t.completed).length} of {tasks.length} completed
              </span>
            </div>

            <form onSubmit={handleQuickAdd} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Add a task..."
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                className="flex-1 bg-white/70 border border-slate-200/80 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button 
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {/* Compact Unscheduled Task List */}
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pt-1">
              {tasks.filter(t => !t.time).map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-grab active:cursor-grabbing border ${categoryMap[task.categoryId]?.bg || 'bg-white'} ${categoryMap[task.categoryId]?.text || 'text-slate-800'} ${categoryMap[task.categoryId]?.border || 'border-slate-200'}`}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTaskComplete(task.id)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className={task.completed ? 'line-through opacity-60' : ''}>{task.title}</span>
                </div>
              ))}
              {tasks.filter(t => !t.time).length === 0 && (
                <span className="text-xs text-slate-400 italic">No unscheduled tasks. All set!</span>
              )}
            </div>
          </div>
        </div>

        {/* Calendar View Container */}
          <div className={`glass-card rounded-2xl p-4 sm:p-6 text-slate-800 ${viewMode === 'day' ? 'planner-calendar-card-day' : ''}`}>
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
            
            {/* Nav Date Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateDate(-1)}
                className="p-2 hover:bg-slate-200/60 rounded-lg transition"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-xs font-semibold bg-white/80 border border-slate-200 rounded-lg shadow-sm hover:bg-white"
              >
                Today
              </button>
              <button
                onClick={() => navigateDate(1)}
                className="p-2 hover:bg-slate-200/60 rounded-lg transition"
              >
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
              <span className="text-base font-bold ml-2 text-slate-800">
                {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>

            {/* Category Filter & View Mode Switcher */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-white/80 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              {/* View Toggle Buttons */}
              <div className="planner-view-control">
                <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1">
                  {['day', 'week', 'month'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                        viewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <button type="button" className="planner-view-settings-button" aria-label="Calendar view settings" aria-expanded={calendarSettingsOpen} onClick={() => setCalendarSettingsOpen(open => !open)}><Settings className="w-4 h-4"/></button>
                {calendarSettingsOpen && <section className="planner-view-settings" aria-label="Calendar settings">
                  <strong>Default calendar view</strong>
                  <div className="planner-default-views">{['day', 'week', 'month'].map(mode => <button type="button" key={mode} className={defaultView === mode ? 'selected' : ''} onClick={() => chooseDefaultView(mode)}>{mode}</button>)}</div>
                  <small>Used whenever you open the planner.</small>
                </section>}
              </div>
            </div>
          </div>

          {/* Calendar Views */}
          <div className="planner-calendar-scroll pt-4 overflow-auto">
            {viewMode === 'day' && (
              <DayView 
                currentDate={currentDate} 
                hours={hours} 
                getTasksForDate={getTasksForDate}
                schoolSchedules={schoolSchedules}
                currentTime={currentTime}
                categoryMap={categoryMap}
                categories={categories}
                onDropSlot={handleDropSlot}
                onToggleComplete={toggleTaskComplete}
                onDeleteTask={deleteTask}
                onUpdateCategory={updateTaskCategory}
              />
            )}
            {viewMode === 'week' && (
              <WeekView 
                currentDate={currentDate} 
                hours={hours} 
                getTasksForDate={getTasksForDate}
                schoolSchedules={schoolSchedules}
                currentTime={currentTime}
                categoryMap={categoryMap}
                categories={categories}
                onDropSlot={handleDropSlot}
                onToggleComplete={toggleTaskComplete}
                onDeleteTask={deleteTask}
                onUpdateCategory={updateTaskCategory}
              />
            )}
            {viewMode === 'month' && (
              <MonthView 
                currentDate={currentDate} 
                getTasksForDate={getTasksForDate}
                schoolSchedules={schoolSchedules}
                categoryMap={categoryMap}
              />
            )}
          </div>
        </div>
      </div>

      {/* Task Edit/Create Modal */}
      {isTaskModalOpen && (
        <TaskModal
          task={editingTask}
          categories={categories}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleSaveTask}
        />
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setIsCategoryModalOpen(false)}
          onAdd={handleAddCategory}
          onDelete={handleDeleteCategory}
          onRename={handleRenameCategory}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Day View Component
// ----------------------------------------------------------------------
function SchoolDayBadge({ schedule, compact = false }) {
  if (!schedule?.schedule_day) return null;
  const color = schedule.color ? `#${schedule.color.replace(/^#/, '')}` : '#6658e8';
  return <span
    className={`school-day-badge ${compact ? 'compact' : ''}`}
    style={{ '--school-color': color, '--school-tint': `color-mix(in srgb, ${color} 18%, white)` }}
    title={schedule.activity_day || schedule.schedule_day}
  >{schedule.schedule_day}</span>;
}

function SchoolPeriod({ period, schedule }) {
  const color = schedule?.color ? `#${schedule.color.replace(/^#/, '')}` : '#6658e8';
  const label = period.period === 'O' ? period.activity || period.name || 'Office hours' : period.activity || period.name || period.period;
  return <div className="school-period" style={{ '--school-color': color, '--school-tint': `color-mix(in srgb, ${color} 15%, white)` }}>
    <time>{period.times}</time><strong title={label}>{label}</strong>
  </div>;
}

function CalendarSlot({ periods, tasks, schedule, categoryMap, categories, onToggleComplete, onDeleteTask, onUpdateCategory, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  const visiblePeriods = expanded ? periods : periods.slice(0, 2);
  const taskLimit = 1;
  const visibleTasks = expanded ? tasks : tasks.slice(0, taskLimit);
  const hiddenCount = periods.length - visiblePeriods.length + tasks.length - visibleTasks.length;

  return <div className={`calendar-slot ${className}`}>
    {visiblePeriods.map((period, index) => <SchoolPeriod key={`period-${period.period}-${index}`} period={period} schedule={schedule} />)}
    {visibleTasks.map(task => <TaskCard key={task.id} task={task} categoryMap={categoryMap} categories={categories} onToggleComplete={onToggleComplete} onDeleteTask={onDeleteTask} onUpdateCategory={onUpdateCategory} />)}
    {(hiddenCount > 0 || expanded && periods.length + tasks.length > 2) && <button type="button" className="calendar-slot-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `Show ${hiddenCount} more`}</button>}
  </div>;
}

function DayView({ currentDate, hours, getTasksForDate, schoolSchedules, currentTime, categoryMap, categories, onDropSlot, onToggleComplete, onDeleteTask, onUpdateCategory }) {
  const dateStr = dateKey(currentDate);
  const schoolSchedule = schoolSchedules[dateStr];

  return (
    <div className="planner-day-view">
      <div className="grid grid-cols-[80px_1fr] border-b border-slate-200 pb-2 mb-2 font-bold text-slate-600 text-sm">
        <div>Time</div>
        <div className="school-day-heading">{currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}<SchoolDayBadge schedule={schoolSchedule} /></div>
      </div>

      <div className="divide-y divide-slate-100">
        {hours.map(hour => {
          const hourTasks = getTasksForDate(dateStr).filter(t => t.time && t.time.startsWith(hour.slice(0, 2)));
          return (
            <div
              key={hour}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropSlot(e, dateStr, hour)}
              className="grid grid-cols-[80px_1fr] min-h-[64px] hover:bg-slate-50/50 transition relative group"
            >
              <div className="text-xs font-semibold text-slate-400 py-2">{hour}</div>
              <CalendarSlot
                className="day-calendar-slot p-1"
                periods={dateStr === dateKey(currentTime)
                  ? schoolEventsForHour(schoolSchedule, hour, currentTime)
                  : (schoolSchedule?.periods || []).filter(period => scheduleStartHour(period.times) === Number(hour.slice(0, 2)))
                }
                tasks={hourTasks}
                schedule={schoolSchedule}
                categoryMap={categoryMap}
                categories={categories}
                onToggleComplete={onToggleComplete}
                onDeleteTask={onDeleteTask}
                onUpdateCategory={onUpdateCategory}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Week View Component
// ----------------------------------------------------------------------
function WeekView({ currentDate, hours, getTasksForDate, schoolSchedules, currentTime, categoryMap, categories, onDropSlot, onToggleComplete, onDeleteTask, onUpdateCategory }) {
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    start.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  return (
    <div className="planner-week-view">
      {/* Week Header */}
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-slate-200 pb-3 mb-2 text-center">
        <div className="text-xs font-bold text-slate-400 self-end">Time</div>
        {weekDays.map(day => {
          const isToday = new Date().toDateString() === day.toDateString();
          return (
            <div key={day.toISOString()} className="flex flex-col items-center">
              <span className="text-xs font-bold uppercase text-slate-400">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={`text-base font-extrabold w-8 h-8 flex items-center justify-center rounded-full mt-1 ${
                isToday ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-800'
              }`}>
                {day.getDate()}
              </span>
              <SchoolDayBadge schedule={schoolSchedules[dateKey(day)]} />
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="divide-y divide-slate-100">
        {hours.map(hour => (
          <div key={hour} className="grid grid-cols-[70px_repeat(7,1fr)] min-h-[70px]">
            <div className="text-xs font-semibold text-slate-400 py-2 pr-2 text-right">{hour}</div>
            {weekDays.map(day => {
              const dateStr = dateKey(day);
              const cellTasks = getTasksForDate(dateStr).filter(t => t.time && t.time.startsWith(hour.slice(0, 2)));
              const schoolSchedule = schoolSchedules[dateStr];
              const periodEvents = (schoolSchedule?.periods || []).filter(period => scheduleStartHour(period.times) === Number(hour.slice(0, 2)));

              return (
                <div
                  key={dateStr}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropSlot(e, dateStr, hour)}
                  className="border-l border-slate-100/80 p-1 hover:bg-indigo-50/20 transition"
                >
                  <CalendarSlot
                    key={`${dateStr}-${hour}`}
                    periods={periodEvents}
                    tasks={cellTasks}
                    schedule={schoolSchedule}
                    categoryMap={categoryMap}
                    categories={categories}
                    onToggleComplete={onToggleComplete}
                    onDeleteTask={onDeleteTask}
                    onUpdateCategory={onUpdateCategory}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Month View Component
// ----------------------------------------------------------------------
function MonthView({ currentDate, getTasksForDate, schoolSchedules, categoryMap }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const daysArray = useMemo(() => {
    const list = [];
    for (let i = 0; i < firstDayIndex; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(new Date(year, month, d));
    }
    return list;
  }, [year, month, daysInMonth, firstDayIndex]);

  return (
    <div className="planner-month-view">
      <div className="grid grid-cols-7 border-b border-slate-200 pb-2 mb-2 text-center text-xs font-bold text-slate-400 uppercase">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
      </div>
      <div className="grid grid-cols-7 gap-1 auto-rows-fr">
        {daysArray.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="min-h-[90px] bg-slate-50/30 rounded-lg" />;
          
          const dateStr = dateKey(day);
          const dayTasks = getTasksForDate(dateStr);
          const schoolSchedule = schoolSchedules[dateStr];
          const isToday = new Date().toDateString() === day.toDateString();

          return (
            <div key={dateStr} className={`min-h-[90px] border border-slate-200/60 rounded-xl p-1.5 flex flex-col justify-between ${isToday ? 'bg-indigo-50/40 border-indigo-300' : 'bg-white/50'}`}>
              <div className="flex justify-between items-center gap-1">
                <span className={`text-xs font-bold ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{day.getDate()}</span>
                <SchoolDayBadge schedule={schoolSchedule} compact />
                {dayTasks.length > 0 && (
                  <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                    {dayTasks.length}
                  </span>
                )}
              </div>
              <div className="space-y-1 mt-1 overflow-y-auto max-h-[60px]">
                {dayTasks.slice(0, 3).map(task => {
                  const cat = categoryMap[task.categoryId] || {};
                  return (
                    <div key={task.id} className={`text-[10px] truncate px-1.5 py-0.5 rounded font-medium ${cat.bg || 'bg-slate-100'} ${cat.text || 'text-slate-800'}`}>
                      {task.title}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="text-[9px] text-slate-400 text-center">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Individual Task Card Component (with category change dropdown & clipping fix)
// ----------------------------------------------------------------------
function TaskCard({ task, categoryMap, categories, onToggleComplete, onDeleteTask, onUpdateCategory }) {
  const cat = categoryMap[task.categoryId] || categoryMap['general'];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
      }}
      className={`group relative p-2 rounded-xl border text-xs shadow-sm transition-all flex flex-col justify-between ${cat.bg} ${cat.text} ${cat.border} overflow-hidden`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => onToggleComplete(task.id, task.occurrenceDate)}
            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0"
          />
          <span className={`font-semibold truncate ${task.completed ? 'line-through opacity-60' : ''}`}>
            {task.title}
          </span>
        </div>

        <button 
          onClick={() => onDeleteTask(task.id)}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-600 transition flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between mt-2 pt-1 border-t border-black/5 text-[10px]">
        <span className="opacity-80 font-medium truncate">
          {task.time ? `${task.time} (${task.duration}m)` : 'Unscheduled'}
        </span>

        {/* Dynamic Category Selector */}
        <select
          value={task.categoryId}
          onChange={(e) => onUpdateCategory(task.id, e.target.value)}
          className="bg-white/60 text-[10px] font-semibold border-0 rounded px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Task Add/Edit Modal
// ----------------------------------------------------------------------
function TaskModal({ task, categories, onClose, onSave }) {
  const [title, setTitle] = useState(task?.title || '');
  const [time, setTime] = useState(task?.time || '08:00');
  const [duration, setDuration] = useState(task?.duration || 30);
  const [categoryId, setCategoryId] = useState(task?.categoryId || 'general');
  const [recurring, setRecurring] = useState(task?.recurring || 'none');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title, time, duration: Number(duration), categoryId, recurring });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-lg font-bold text-slate-800">{task ? 'Edit Task' : 'New Task'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Task name..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Duration (mins)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Recurrence</label>
              <select
                value={recurring}
                onChange={(e) => setRecurring(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="none">Does not repeat</option>
                <optgroup label="School schedule days">
                  <option value="a-d">Every A-D day</option>
                  <option value="d-a">Every D-A day</option>
                  <option value="h-e">Every H-E day</option>
                  <option value="e-h">Every E-H day</option>
                </optgroup>
                <optgroup label="Common repeats">
                  <option value="daily">Every day</option>
                  <option value="every-other-day">Every other day</option>
                  <option value="weekdays">Every weekday</option>
                  <option value="weekends">Every weekend</option>
                  <option value="weekly">Every week on this weekday</option>
                  <option value="every-2-weeks">Every 2 weeks</option>
                  <option value="every-4-weeks">Every 4 weeks</option>
                  <option value="monthly">Every month on this date</option>
                  <option value="every-2-months">Every 2 months</option>
                  <option value="every-3-months">Every 3 months</option>
                  <option value="every-6-months">Every 6 months</option>
                  <option value="yearly">Every year</option>
                </optgroup>
                <optgroup label="Day intervals">
                  <option value="every-3-days">Every 3 days</option>
                  <option value="every-4-days">Every 4 days</option>
                  <option value="every-5-days">Every 5 days</option>
                  <option value="every-6-days">Every 6 days</option>
                </optgroup>
                <optgroup label="Weekly on a specific day">
                  <option value="weekly:0">Every Sunday</option>
                  <option value="weekly:1">Every Monday</option>
                  <option value="weekly:2">Every Tuesday</option>
                  <option value="weekly:3">Every Wednesday</option>
                  <option value="weekly:4">Every Thursday</option>
                  <option value="weekly:5">Every Friday</option>
                  <option value="weekly:6">Every Saturday</option>
                </optgroup>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 shadow-md">Save Task</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Category Manager Modal (Create & Delete Categories)
// ----------------------------------------------------------------------
function CategoryManagerModal({ categories, onClose, onAdd, onDelete, onRename }) {
  const [newCatName, setNewCatName] = useState('');
  const [selectedPalette, setSelectedPalette] = useState(PALETTES[0]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    onAdd(newCatName.trim(), selectedPalette);
    setNewCatName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-lg font-bold text-slate-800">Manage Categories</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        {/* Existing Categories */}
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          <label className="block text-xs font-bold text-slate-600 mb-1">Existing Groups</label>
          {categories.map(cat => (
            <div key={cat.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${cat.bg} ${cat.border}`}>
              <input
                aria-label={`Rename ${cat.name} category`}
                title="Edit category name"
                className={`category-name-input text-xs font-bold ${cat.text}`}
                defaultValue={cat.name}
                onBlur={(e) => onRename(cat.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
              {cat.id !== 'general' ? (
                <button
                  onClick={() => onDelete(cat.id)}
                  className="p-1 hover:bg-rose-200/50 rounded-lg text-rose-600 transition"
                  title="Delete category"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Default</span>
              )}
            </div>
          ))}
        </div>

        {/* Add New Category */}
        <form onSubmit={handleCreate} className="space-y-3 pt-2 border-t">
          <label className="block text-xs font-bold text-slate-600">Create New Category</label>
          <input
            type="text"
            placeholder="Category name..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Color Theme</label>
            <div className="flex gap-2">
              {PALETTES.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedPalette(p)}
                  className={`w-7 h-7 rounded-full border-2 transition ${p.bg} ${
                    selectedPalette.name === p.name ? 'border-indigo-600 scale-110 shadow-sm' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-sm transition shadow-md"
          >
            Add Category
          </button>
        </form>
      </div>
    </div>
  );
}
