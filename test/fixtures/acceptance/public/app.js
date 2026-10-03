'use strict';
// Frontend — real fetches to the backend, with loading/error handling on the
// working paths. Deliberate defects for the acceptance run to catch:
//   - #exportBtn is a MOCK (onclick returns false, no implementation)
//   - #helpLink is a MOCK (href="#")
//   - #clearBtn calls clearAllTasks() which is not defined -> BROKEN at runtime
//   - the console.log below is a hygiene defect the repair stage removes

console.log('[taskboard] frontend booting');

const list = document.getElementById('list');

async function loadTasks() {
  list.innerHTML = '<li>Loading…</li>';
  try {
    const res = await fetch('/api/tasks');
    const { tasks } = await res.json();
    list.innerHTML = tasks.length
      ? tasks.map((t) => '<li>' + t.title + '</li>').join('')
      : '<li>No tasks yet</li>';
  } catch (e) {
    list.innerHTML = '<li class="error">Could not load tasks</li>';
  }
}

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('title');
  const title = input.value.trim();
  if (!title) return;
  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  try {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title })
    });
    input.value = '';
    await loadTasks();
  } catch (e) {
    alert('Failed to add task');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('refreshBtn').addEventListener('click', loadTasks);

loadTasks();
