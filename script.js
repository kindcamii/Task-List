/**
 * script.js — Task List App
 *
 * Fitur:
 *  - Create  : tambah task baru
 *  - Read    : tampilkan daftar task
 *  - Update  : edit teks task + toggle status (completed/active)
 *  - Delete  : hapus satu task / hapus semua yang selesai
 *  - Filter  : All | Active | Completed (tanpa reload halaman)
 *  - Persist : data disimpan di localStorage
 */

"use strict";

/* ================================================================
   KONSTANTA & STATE
   ================================================================ */

/** Key yang digunakan untuk menyimpan data di localStorage */
const STORAGE_KEY = "tasklist_tasks";

/**
 * State aplikasi — satu-satunya sumber kebenaran (single source of truth).
 * @type {{ tasks: Task[], currentFilter: string }}
 *
 * @typedef {{ id: string, text: string, completed: boolean, createdAt: number }} Task
 */
const state = {
  tasks: loadFromStorage(),
  currentFilter: "all",
};

/* ================================================================
   REFERENSI ELEMEN DOM
   ================================================================ */
const taskInput         = document.getElementById("task-input");
const addBtn            = document.getElementById("add-btn");
const taskList          = document.getElementById("task-list");
const emptyState        = document.getElementById("empty-state");
const taskCounter       = document.getElementById("task-counter");
const clearCompletedBtn = document.getElementById("clear-completed-btn");
const filterBtns        = document.querySelectorAll(".filter-btn");

// Modal edit
const editModal         = document.getElementById("edit-modal");
const editInput         = document.getElementById("edit-input");
const modalOverlay      = document.getElementById("modal-overlay");
const modalSaveBtn      = document.getElementById("modal-save-btn");
const modalCancelBtn    = document.getElementById("modal-cancel-btn");

/** ID task yang sedang diedit (null jika modal tertutup) */
let editingTaskId = null;

/* ================================================================
   UTILITAS
   ================================================================ */

/**
 * Membuat ID unik berbasis timestamp + angka acak.
 * @returns {string}
 */
function generateId() {
  return `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Memuat daftar task dari localStorage.
 * Mengembalikan array kosong jika belum ada data.
 * @returns {Task[]}
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    // Data korup di localStorage — mulai fresh
    console.warn("Gagal memuat data dari localStorage:", e);
    return [];
  }
}

/**
 * Menyimpan daftar task saat ini ke localStorage.
 */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

/* ================================================================
   RENDER
   ================================================================ */

/**
 * Me-render ulang seluruh tampilan berdasarkan state terkini.
 * Dipanggil setiap kali state berubah.
 */
function render() {
  const filtered = getFilteredTasks();

  // Kosongkan list sebelum mengisi ulang
  taskList.innerHTML = "";

  if (filtered.length === 0) {
    // Tampilkan empty state — gunakan style.display agar tidak konflik
    // dengan Tailwind 'hidden' yang menggunakan !important
    emptyState.style.display = "flex";
  } else {
    emptyState.style.display = "none";

    // Render setiap task yang lolos filter
    filtered.forEach((task) => {
      taskList.appendChild(createTaskElement(task));
    });
  }

  updateCounter();
  updateClearButton();
  updateFilterButtons();
}

/**
 * Membuat elemen <li> untuk sebuah task.
 * @param {Task} task
 * @returns {HTMLLIElement}
 */
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = `task-item${task.completed ? " completed" : ""}`;
  li.dataset.id = task.id;

  // Escape teks untuk mencegah XSS
  const safeText = escapeHtml(task.text);

  li.innerHTML = `
    <input
      type="checkbox"
      class="task-checkbox"
      aria-label="Tandai task selesai"
      ${task.completed ? "checked" : ""}
    />
    <span class="task-text">${safeText}</span>
    <div class="task-actions" role="group" aria-label="Aksi task">
      <button class="task-btn btn-edit"   title="Edit task"   aria-label="Edit task">✏️</button>
      <button class="task-btn btn-delete" title="Hapus task"  aria-label="Hapus task">🗑️</button>
    </div>
  `;

  // --- Event listeners pada elemen yang baru dibuat ---

  // Toggle completed
  const checkbox = li.querySelector(".task-checkbox");
  checkbox.addEventListener("change", () => toggleTask(task.id));

  // Buka modal edit
  const editBtn = li.querySelector(".btn-edit");
  editBtn.addEventListener("click", () => openEditModal(task.id));

  // Hapus task
  const deleteBtn = li.querySelector(".btn-delete");
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  return li;
}

/**
 * Memperbarui teks counter task aktif di header.
 */
function updateCounter() {
  const activeCount = state.tasks.filter((t) => !t.completed).length;
  taskCounter.textContent = `${activeCount} task aktif`;
}

/**
 * Menampilkan / menyembunyikan tombol "Hapus semua yang selesai".
 */
function updateClearButton() {
  const hasCompleted = state.tasks.some((t) => t.completed);
  // Gunakan style.display agar tidak konflik dengan Tailwind 'hidden'
  clearCompletedBtn.style.display = hasCompleted ? "inline-block" : "none";
}

/**
 * Memperbarui tampilan tombol filter (aktif/non-aktif).
 */
function updateFilterButtons() {
  filterBtns.forEach((btn) => {
    const isActive = btn.dataset.filter === state.currentFilter;
    btn.classList.toggle("active-filter", isActive);
  });
}

/**
 * Mengembalikan daftar task yang sesuai dengan filter saat ini.
 * @returns {Task[]}
 */
function getFilteredTasks() {
  switch (state.currentFilter) {
    case "active":
      return state.tasks.filter((t) => !t.completed);
    case "completed":
      return state.tasks.filter((t) => t.completed);
    default: // "all"
      return [...state.tasks];
  }
}

/* ================================================================
   CRUD OPERATIONS
   ================================================================ */

/**
 * Menambahkan task baru ke state dan menyimpannya.
 */
function addTask() {
  const text = taskInput.value.trim();

  // Validasi: input tidak boleh kosong
  if (!text) {
    shakeInput();
    return;
  }

  /** @type {Task} */
  const newTask = {
    id: generateId(),
    text,
    completed: false,
    createdAt: Date.now(),
  };

  state.tasks.unshift(newTask); // Tambah di awal agar muncul di atas
  saveToStorage();
  render();

  // Reset input
  taskInput.value = "";
  taskInput.focus();
}

/**
 * Mengganti status completed pada sebuah task.
 * @param {string} id
 */
function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  saveToStorage();
  render();
}

/**
 * Menghapus satu task berdasarkan ID.
 * @param {string} id
 */
function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveToStorage();
  render();
}

/**
 * Menghapus semua task yang sudah berstatus completed.
 */
function clearCompletedTasks() {
  state.tasks = state.tasks.filter((t) => !t.completed);
  saveToStorage();
  render();
}

/**
 * Menyimpan perubahan teks task dari modal edit.
 */
function saveEdit() {
  const newText = editInput.value.trim();
  if (!newText || !editingTaskId) return;

  const task = state.tasks.find((t) => t.id === editingTaskId);
  if (task) {
    task.text = newText;
    saveToStorage();
    render();
  }

  closeEditModal();
}

/* ================================================================
   MODAL EDIT
   ================================================================ */

/**
 * Membuka modal edit dan mengisi input dengan teks task saat ini.
 * @param {string} id
 */
function openEditModal(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  editingTaskId = id;
  editInput.value = task.text;

  // Gunakan style.display langsung — tidak bisa di-override oleh Tailwind
  editModal.style.display = "flex";
  editInput.focus();
  editInput.select();
}

/** Menutup modal edit dan mereset state editing. */
function closeEditModal() {
  editingTaskId = null;
  editModal.style.display = "none";
}

/* ================================================================
   UX HELPERS
   ================================================================ */

/**
 * Efek shake pada input saat validasi gagal.
 */
function shakeInput() {
  // Hapus class dulu + force reflow agar animasi bisa re-trigger
  // jika user menekan tombol berkali-kali tanpa isi input
  taskInput.classList.remove("shake");
  void taskInput.offsetWidth; // Paksa browser recalculate style
  taskInput.classList.add("shake");
  taskInput.addEventListener("animationend", () => {
    taskInput.classList.remove("shake");
  }, { once: true });
}

/**
 * Meng-escape karakter HTML untuk mencegah XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ================================================================
   EVENT LISTENERS
   ================================================================ */

// --- Tambah task ---
addBtn.addEventListener("click", addTask);

// Tambah task dengan Enter
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

// --- Filter ---
filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.currentFilter = btn.dataset.filter;
    render();
  });
});

// --- Hapus semua yang selesai ---
clearCompletedBtn.addEventListener("click", clearCompletedTasks);

// --- Modal: tombol Simpan ---
modalSaveBtn.addEventListener("click", saveEdit);

// --- Modal: tombol Batal ---
modalCancelBtn.addEventListener("click", closeEditModal);

// --- Modal: klik overlay untuk menutup ---
modalOverlay.addEventListener("click", closeEditModal);

// --- Modal: tekan Escape untuk menutup ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editModal.style.display !== "none") {
    closeEditModal();
  }
});

// --- Modal: simpan dengan Enter ---
editInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveEdit();
});

/* ================================================================
   INIT
   ================================================================ */

// Render awal saat halaman dimuat
render();
