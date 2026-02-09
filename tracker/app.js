// Supabase Configuration
const SUPABASE_URL = 'https://ygryvsfjpmwmbuznfvdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlncnl2c2ZqcG13bWJ1em5mdmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTE5NTksImV4cCI6MjA4NTk2Nzk1OX0.YDou5E7-8cH4twt9MzT2bV52lr6pbsqcxULmMrMMMbM';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let tasks = [];
let streaks = { current: 0, longest: 0 };
let history = [];
let currentTaskIdForFailure = null;

// DOM Elements
const addTaskForm = document.getElementById('add-task-form');
const taskTitleInput = document.getElementById('task-title');
const dailyTasksContainer = document.getElementById('daily-tasks');
const onceTasksContainer = document.getElementById('once-tasks');
const dailyTasksEmpty = document.getElementById('daily-tasks-empty');
const onceTasksEmpty = document.getElementById('once-tasks-empty');
const currentDateElement = document.getElementById('current-date');
const currentStreakElement = document.getElementById('current-streak');
const longestStreakElement = document.getElementById('longest-streak');
const calendarElement = document.getElementById('calendar');
const failureModal = document.getElementById('failure-modal');
const failureNoteInput = document.getElementById('failure-note-input');
const failureNoteError = document.getElementById('failure-note-error');
const failureModalCancel = document.getElementById('failure-modal-cancel');
const failureModalSubmit = document.getElementById('failure-modal-submit');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  checkConfig();
  initializeApp();
  setupEventListeners();
});

function checkConfig() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    alert('⚠️ Please configure your Supabase credentials in app.js\n\nSet SUPABASE_URL and SUPABASE_ANON_KEY at the top of the file.');
  }
}

async function initializeApp() {
  updateCurrentDate();
  await loadTasks();
  await loadStreaksAndHistory();
}

function setupEventListeners() {
  addTaskForm.addEventListener('submit', handleAddTask);
  failureModalCancel.addEventListener('click', hideFailureModal);
  failureModalSubmit.addEventListener('click', handleFailureNoteSubmit);

  failureModal.addEventListener('click', (e) => {
    if (e.target === failureModal) {
      hideFailureModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !failureModal.classList.contains('hidden')) {
      hideFailureModal();
    }
  });
}

// Date utilities
function updateCurrentDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = new Date().toLocaleDateString('en-US', options);
  currentDateElement.textContent = dateStr;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Supabase API calls
async function fetchTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function createTask(title, type) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ title, type, is_archived: false }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateTask(id, title) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ title })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .update({ is_archived: true })
    .eq('id', id);

  if (error) throw error;
}

async function fetchCompletions() {
  const { data, error } = await supabase
    .from('completions')
    .select('*')
    .order('completed_date', { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

async function getCompletionForTaskAndDate(taskId, date) {
  const { data, error } = await supabase
    .from('completions')
    .select('*')
    .eq('task_id', taskId)
    .eq('completed_date', date)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function markComplete(taskId, date) {
  const existing = await getCompletionForTaskAndDate(taskId, date);

  if (existing) {
    const { data, error } = await supabase
      .from('completions')
      .update({ is_completed: true, failure_note: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('completions')
      .insert([{ task_id: taskId, completed_date: date, is_completed: true }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

async function markIncomplete(taskId, date, failureNote) {
  const existing = await getCompletionForTaskAndDate(taskId, date);

  if (existing) {
    const { data, error } = await supabase
      .from('completions')
      .update({ is_completed: false, failure_note: failureNote, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('completions')
      .insert([{ task_id: taskId, completed_date: date, is_completed: false, failure_note: failureNote }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// Task management
async function loadTasks() {
  try {
    const today = getTodayDate();
    const [tasksData, completionsData] = await Promise.all([
      fetchTasks(),
      fetchCompletions()
    ]);

    const completionsMap = {};
    completionsData.forEach(comp => {
      if (!completionsMap[comp.task_id]) {
        completionsMap[comp.task_id] = { today: false, ever: false };
      }
      if (comp.completed_date === today && comp.is_completed) {
        completionsMap[comp.task_id].today = true;
      }
      if (comp.is_completed) {
        completionsMap[comp.task_id].ever = true;
      }
    });

    tasks = tasksData.map(task => ({
      ...task,
      completed_today: task.type === 'daily'
        ? completionsMap[task.id]?.today || false
        : completionsMap[task.id]?.ever || false
    }));

    renderTasks();
  } catch (error) {
    console.error('Error loading tasks:', error);
    alert('Failed to load tasks. Please check your Supabase configuration and try refreshing the page.');
  }
}

function renderTasks() {
  const dailyTasks = tasks.filter(t => t.type === 'daily');
  const onceTasks = tasks.filter(t => t.type === 'once');

  if (dailyTasks.length === 0) {
    dailyTasksContainer.innerHTML = '';
    dailyTasksEmpty.classList.remove('hidden');
  } else {
    dailyTasksEmpty.classList.add('hidden');
    dailyTasksContainer.innerHTML = dailyTasks.map(renderTaskItem).join('');
  }

  if (onceTasks.length === 0) {
    onceTasksContainer.innerHTML = '';
    onceTasksEmpty.classList.remove('hidden');
  } else {
    onceTasksEmpty.classList.add('hidden');
    onceTasksContainer.innerHTML = onceTasks.map(renderTaskItem).join('');
  }

  attachTaskEventListeners();
}

function renderTaskItem(task) {
  const checkedAttr = task.completed_today ? 'checked' : '';
  const completedClass = task.completed_today ? 'task-completed' : '';

  return `
    <div class="task-item ${completedClass} flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors" data-task-id="${task.id}">
      <input
        type="checkbox"
        class="task-checkbox w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
        ${checkedAttr}
        data-task-id="${task.id}"
      />
      <span class="task-title flex-1 text-gray-800" data-task-id="${task.id}">${escapeHtml(task.title)}</span>
      <button class="edit-btn px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors" data-task-id="${task.id}">
        Edit
      </button>
      <button class="delete-btn px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors" data-task-id="${task.id}">
        Delete
      </button>
    </div>
  `;
}

function attachTaskEventListeners() {
  document.querySelectorAll('.task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleTaskToggle);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', handleTaskEdit);
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', handleTaskDelete);
  });
}

async function handleAddTask(e) {
  e.preventDefault();

  const title = taskTitleInput.value.trim();
  const type = document.querySelector('input[name="task-type"]:checked').value;

  if (!title) return;

  try {
    await createTask(title, type);
    taskTitleInput.value = '';
    await refreshAll();
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Failed to add task. Please try again.');
  }
}

async function handleTaskToggle(e) {
  const taskId = e.target.dataset.taskId;
  const isChecked = e.target.checked;
  const today = getTodayDate();

  if (isChecked) {
    try {
      await markComplete(taskId, today);
      await refreshAll();
    } catch (error) {
      console.error('Error marking task complete:', error);
      e.target.checked = false;
      alert('Failed to mark task complete. Please try again.');
    }
  } else {
    e.target.checked = true;
    currentTaskIdForFailure = taskId;
    showFailureModal();
  }
}

async function handleTaskEdit(e) {
  const taskId = e.target.dataset.taskId;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newTitle = prompt('Edit task title:', task.title);
  if (newTitle && newTitle.trim() && newTitle.trim() !== task.title) {
    try {
      await updateTask(taskId, newTitle.trim());
      await refreshAll();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task. Please try again.');
    }
  }
}

async function handleTaskDelete(e) {
  const taskId = e.target.dataset.taskId;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (confirm(`Are you sure you want to delete "${task.title}"?`)) {
    try {
      await deleteTask(taskId);
      await refreshAll();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task. Please try again.');
    }
  }
}

// Failure modal
function showFailureModal() {
  failureNoteInput.value = '';
  failureNoteError.classList.add('hidden');
  failureModal.classList.remove('hidden');
  failureNoteInput.focus();
}

function hideFailureModal() {
  failureModal.classList.add('hidden');
  currentTaskIdForFailure = null;
  loadTasks();
}

async function handleFailureNoteSubmit() {
  const note = failureNoteInput.value.trim();

  if (!note) {
    failureNoteError.classList.remove('hidden');
    return;
  }

  const today = getTodayDate();

  try {
    await markIncomplete(currentTaskIdForFailure, today, note);
    hideFailureModal();
    await refreshAll();
  } catch (error) {
    console.error('Error marking task incomplete:', error);
    alert('Failed to uncheck task. Please try again.');
  }
}

// Streaks and history
async function loadStreaksAndHistory() {
  try {
    const [tasksData, completionsData] = await Promise.all([
      fetchTasks(),
      fetchCompletions()
    ]);

    const today = getTodayDate();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 27);

    history = calculateHistory(tasksData, completionsData, startDate, new Date());
    streaks = calculateStreaks(history);

    renderStreaks();
    renderCalendar();
  } catch (error) {
    console.error('Error loading streaks and history:', error);
  }
}

function calculateHistory(tasks, completions, startDate, endDate) {
  const history = [];
  const completionsMap = {};

  completions.forEach(comp => {
    const key = `${comp.task_id}_${comp.completed_date}`;
    completionsMap[key] = comp.is_completed;
  });

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    const activeDailyTasks = tasks.filter(t =>
      t.type === 'daily' &&
      new Date(t.created_at).toISOString().split('T')[0] <= dateStr
    );

    const completedCount = activeDailyTasks.filter(t =>
      completionsMap[`${t.id}_${dateStr}`] === true
    ).length;

    const total = activeDailyTasks.length;
    const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    history.push({
      date: dateStr,
      total,
      completed: completedCount,
      percentage
    });
  }

  return history;
}

function calculateStreaks(history) {
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const day = history[i];
    if (day.percentage >= 80 && day.total > 0) {
      if (i === history.length - 1 || currentStreak > 0) {
        currentStreak++;
      }
    } else if (day.total > 0) {
      currentStreak = 0;
    }
  }

  for (const day of history) {
    if (day.percentage >= 80 && day.total > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else if (day.total > 0) {
      tempStreak = 0;
    }
  }

  return { current: currentStreak, longest: longestStreak };
}

function renderStreaks() {
  currentStreakElement.textContent = streaks.current;
  longestStreakElement.textContent = streaks.longest;
}

function renderCalendar() {
  if (history.length === 0) {
    calendarElement.innerHTML = '<p class="text-gray-400 col-span-full text-center py-8">No data available yet</p>';
    return;
  }

  calendarElement.innerHTML = history.map(day => {
    const percentage = day.percentage;
    const bgColor = getColorForPercentage(percentage);

    return `
      <div class="calendar-day ${bgColor} rounded-lg p-3 text-center cursor-pointer hover:opacity-80 transition-opacity" title="${day.date}: ${percentage}% complete">
        <p class="text-xs font-medium text-gray-700">${formatDate(day.date)}</p>
        <p class="text-lg font-bold text-gray-800">${percentage}%</p>
        <p class="text-xs text-gray-600">${day.completed}/${day.total}</p>
      </div>
    `;
  }).join('');
}

function getColorForPercentage(percentage) {
  if (percentage === 0) return 'bg-gray-100';
  if (percentage < 25) return 'bg-red-100';
  if (percentage < 50) return 'bg-orange-100';
  if (percentage < 75) return 'bg-yellow-100';
  if (percentage < 100) return 'bg-lime-100';
  return 'bg-green-200';
}

async function refreshAll() {
  await loadTasks();
  await loadStreaksAndHistory();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
