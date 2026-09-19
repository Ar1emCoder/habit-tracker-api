"use strict";

const $ = (selector, element = document) => element.querySelector(selector);
const $$ = (selector, element = document) => [...element.querySelectorAll(selector)];

const WEEKDAYS = [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота"
];

const MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря"
];

function toDateStr(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;
}

function today() {
    return toDateStr(new Date());
}

function addDays(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);

    return toDateStr(date);
}

function uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function esc(value) {
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    };

    return String(value ?? "").replace(/[&<>"']/g, (character) => map[character]);
}

function fmtHeaderDate() {
    const date = new Date();

    return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function fmtDue(dateString) {
    if (!dateString) {
        return "";
    }

    if (dateString === today()) {
        return "Сегодня";
    }

    if (dateString === addDays(1)) {
        return "Завтра";
    }

    const parts = dateString.split("-").map(Number);
    const month = parts[1];
    const day = parts[2];

    if (!month || !day || !MONTHS[month - 1]) {
        return "";
    }

    return `${day} ${MONTHS[month - 1].slice(0, 3)}`;
}

function dayLabel(dateString) {
    if (!dateString) {
        return "";
    }

    if (dateString === today()) {
        return "Сегодня";
    }

    if (dateString === addDays(1)) {
        return "Завтра";
    }

    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return `${WEEKDAYS[date.getDay()]}, ${day} ${MONTHS[month - 1].slice(0, 3)}`;
}

const Store = {
    get(key, defaultValue) {
        try {
            const rawValue = localStorage.getItem(`tt_${key}`);

            if (rawValue === null) {
                return defaultValue;
            }

            const value = JSON.parse(rawValue);

            return value ?? defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(`tt_${key}`, JSON.stringify(value));
        } catch (error) {
            console.error("Ошибка сохранения в localStorage:", error);
            toast("Не удалось сохранить данные в браузере", "error");
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(`tt_${key}`);
        } catch (error) {
            console.error("Ошибка удаления из localStorage:", error);
        }
    }
};

const state = {
    view: "today",
    tasks: Store.get("tasks", []),
    habits: [],
    session: Store.get("session", null),

    editingTaskId: null,
    presetQuadrant: null,
    confirmAction: null,
    search: "",

    lastFocusedElement: null
};

let prevView = "today";
let authMode = "login";

const Backend = {
    base: Store.get("apiUrl", "http://127.0.0.1:8000"),
    available: false,

    async check() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        try {
            const response = await fetch(`${this.base}/habits/stats`, {
                signal: controller.signal
            });

            this.available = response.ok;
        } catch {
            this.available = false;
        } finally {
            clearTimeout(timeoutId);
        }

        return this.available;
    },

    headers(withAuth = false) {
        const headers = {
            "Content-Type": "application/json"
        };

        if (withAuth && state.session?.token) {
            headers.Authorization = `Bearer ${state.session.token}`;
        }

        return headers;
    },

    async req(method, path, body = null, withAuth = false) {
        let response;

        try {
            response = await fetch(`${this.base}${path}`, {
                method,
                headers: this.headers(withAuth),
                body: body === null ? null : JSON.stringify(body)
            });
        } catch {
            const error = new Error("Не удалось подключиться к API-серверу");
            error.status = 0;

            throw error;
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.detail || `Ошибка сервера: ${response.status}`);
            error.status = response.status;

            throw error;
        }

        return data;
    }
};

const VIEW_META = {
    today: "Задачи на сегодня и просроченные",
    tomorrow: "Планы на завтрашний день",
    week: "Задачи ближайшей недели",
    inbox: "Задачи без даты",
    habits: "Трекер привычек и серий",
    matrix: "Приоритизация по важности и срочности",
    stats: "Сводка продуктивности",
    search: "Результаты поиска"
};

const VIEW_TITLES = {
    today: "Сегодня",
    tomorrow: "Завтра",
    week: "Следующие 7 дней",
    inbox: "Входящие",
    habits: "Привычки",
    matrix: "Матрица Эйзенхауэра",
    stats: "Статистика",
    search: "Поиск"
};

const MATRIX = [
    {
        key: "do",
        title: "Важно и срочно",
        hint: "Сделать сейчас",
        cls: "q1"
    },
    {
        key: "schedule",
        title: "Важно, но не срочно",
        hint: "Запланировать",
        cls: "q2"
    },
    {
        key: "delegate",
        title: "Срочно, но не важно",
        hint: "Делегировать",
        cls: "q3"
    },
    {
        key: "eliminate",
        title: "Не важно и не срочно",
        hint: "Убрать / отложить",
        cls: "q4"
    }
];

function quadrantOf(task) {
    if (task.important && task.urgent) {
        return "do";
    }

    if (task.important) {
        return "schedule";
    }

    if (task.urgent) {
        return "delegate";
    }

    return "eliminate";
}

function quadrantTitle(key) {
    return MATRIX.find((quadrant) => quadrant.key === key)?.title || "Без категории";
}

function toast(message, type = "info") {
    const container = $("#toasts");

    if (!container) {
        return;
    }

    const element = document.createElement("div");

    element.className = `toast ${type}`;
    element.textContent = message;

    container.appendChild(element);

    requestAnimationFrame(() => {
        element.classList.add("show");
    });

    setTimeout(() => {
        element.classList.remove("show");

        setTimeout(() => {
            element.remove();
        }, 350);
    }, 3000);
}

function show(element) {
    if (!element) {
        return;
    }

    element.classList.remove("hidden");
    element.setAttribute("aria-hidden", "false");
}

function hide(element) {
    if (!element) {
        return;
    }

    element.classList.add("hidden");
    element.setAttribute("aria-hidden", "true");

    if (state.lastFocusedElement) {
        state.lastFocusedElement.focus?.();
        state.lastFocusedElement = null;
    }
}

function openModal(selector, focusSelector = null) {
    const modal = $(selector);

    if (!modal) {
        return;
    }

    state.lastFocusedElement = document.activeElement;
    show(modal);

    if (focusSelector) {
        setTimeout(() => {
            $(focusSelector)?.focus();
        }, 50);
    }
}

function emptyState(title, icon = "#i-inbox") {
    return `
        <div class="empty-state">
            <svg aria-hidden="true">
                <use href="${icon}"></use>
            </svg>

            <div class="empty-title">${esc(title)}</div>
        </div>
    `;
}

function localHash(password) {
    let hash = 0;

    for (const character of password) {
        hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }

    return `h${hash.toString(16)}`;
}

function localStreak(completions = []) {
    const dates = [...new Set(completions)].sort().reverse();

    if (!dates.length) {
        return 0;
    }

    if (dates[0] !== today() && dates[0] !== addDays(-1)) {
        return 0;
    }

    let streak = 0;
    const expectedDate = new Date(`${dates[0]}T12:00:00`);

    for (const dateString of dates) {
        if (dateString === toDateStr(expectedDate)) {
            streak += 1;
            expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

function seedDemo() {
    if (Store.get("seeded", false)) {
        return;
    }

    state.tasks = [
        {
            id: uid(),
            title: "Подготовить презентацию",
            date: today(),
            important: true,
            urgent: true,
            done: false,
            doneAt: null,
            createdAt: new Date().toISOString()
        },
        {
            id: uid(),
            title: "Позвонить маме",
            date: today(),
            important: false,
            urgent: true,
            done: false,
            doneAt: null,
            createdAt: new Date().toISOString()
        },
        {
            id: uid(),
            title: "Изучить FastAPI: роутеры и Depends",
            date: addDays(1),
            important: true,
            urgent: false,
            done: false,
            doneAt: null,
            createdAt: new Date().toISOString()
        }
    ];

    Store.set("tasks", state.tasks);

    Store.set("habitsLocal", [
        {
            id: "h1",
            name: "Пить 2 литра воды",
            createdAt: new Date().toISOString(),
            completions: [addDays(-1), addDays(-2)]
        },
        {
            id: "h2",
            name: "Читать 20 минут",
            createdAt: new Date().toISOString(),
            completions: [addDays(-1)]
        }
    ]);

    Store.set("seeded", true);
}

async function loadHabits() {
    if (Backend.available) {
        if (!state.session) {
            state.habits = [];
            return;
        }

        try {
            const rows = await Backend.req("GET", "/habits", null, true);
            const localHabits = Store.get("habitsLocal", []);
            const doneToday = Store.get("habitDoneToday", {});

            state.habits = rows.map((row) => {
                const localHabit = localHabits.find(
                    (habit) => String(habit.id) === String(row.id)
                );

                return {
                    ...row,
                    completions: localHabit?.completions || [],
                    doneToday: doneToday[String(row.id)] === today(),
                    streak: 0
                };
            });

            await Promise.all(
                state.habits.map(async (habit) => {
                    try {
                        const result = await Backend.req(
                            "GET",
                            `/habits/${habit.id}/streak`,
                            null,
                            true
                        );

                        habit.streak = result.curr_streak || 0;
                    } catch {
                        habit.streak = 0;
                    }
                })
            );
        } catch (error) {
            if (error.status === 401) {
                state.session = null;
                Store.set("session", null);
                toast("Сессия истекла. Войдите снова.", "error");
            } else {
                toast(`Ошибка загрузки привычек: ${error.message}`, "error");
            }

            state.habits = [];
        }

        return;
    }

    state.habits = Store.get("habitsLocal", []).map((habit) => ({
        ...habit,
        completions: habit.completions || []
    }));

    for (const habit of state.habits) {
        habit.streak = localStreak(habit.completions);
        habit.doneToday = habit.completions.includes(today());
    }
}

async function addHabit(name) {
    const cleanName = name.trim();

    if (!cleanName) {
        toast("Введите название привычки", "error");
        return;
    }

    if (Backend.available) {
        if (!state.session) {
            openAuth("Чтобы управлять привычками на сервере, выполните вход.");
            return;
        }

        try {
            await Backend.req("POST", "/habits", { name: cleanName }, true);

            await loadHabits();

            toast("Привычка добавлена", "success");
            render();
        } catch (error) {
            toast(`Ошибка: ${error.message}`, "error");
        }

        return;
    }

    const localHabits = Store.get("habitsLocal", []);

    localHabits.push({
        id: uid(),
        name: cleanName,
        createdAt: new Date().toISOString(),
        completions: []
    });

    Store.set("habitsLocal", localHabits);

    await loadHabits();

    toast("Привычка добавлена", "success");
    render();
}

async function renameHabit(id, newName) {
    const cleanName = newName.trim();

    if (!cleanName) {
        toast("Название привычки не может быть пустым", "error");
        return;
    }

    if (Backend.available) {
        try {
            await Backend.req(
                "PUT",
                `/habits/${encodeURIComponent(id)}?new_name=${encodeURIComponent(cleanName)}`,
                {},
                true
            );

            await loadHabits();
            toast("Привычка переименована", "success");
            render();
        } catch (error) {
            toast(`Ошибка: ${error.message}`, "error");
        }

        return;
    }

    const localHabits = Store.get("habitsLocal", []);
    const habit = localHabits.find((item) => String(item.id) === String(id));

    if (!habit) {
        return;
    }

    habit.name = cleanName;

    Store.set("habitsLocal", localHabits);

    await loadHabits();

    toast("Привычка переименована", "success");
    render();
}

async function completeHabit(id) {
    if (Backend.available) {
        if (!state.session) {
            openAuth("Чтобы отмечать привычки, выполните вход.");
            return;
        }

        try {
            await Backend.req(
                "POST",
                `/habits/${encodeURIComponent(id)}/complete`,
                {},
                true
            );

            const doneToday = Store.get("habitDoneToday", {});
            doneToday[String(id)] = today();

            Store.set("habitDoneToday", doneToday);

            const habit = state.habits.find(
                (item) => String(item.id) === String(id)
            );

            if (habit) {
                habit.doneToday = true;
                habit.streak = (habit.streak || 0) + 1;
            }

            toast("Привычка выполнена!", "success");
            render();
        } catch (error) {
            if (error.status === 409) {
                toast("Эта привычка уже отмечена на сегодня", "error");
            } else {
                toast(`Ошибка: ${error.message}`, "error");
            }
        }

        return;
    }

    const localHabits = Store.get("habitsLocal", []);
    const habit = localHabits.find((item) => String(item.id) === String(id));

    if (!habit) {
        return;
    }

    habit.completions = habit.completions || [];

    if (habit.completions.includes(today())) {
        toast("Эта привычка уже отмечена на сегодня", "error");
        return;
    }

    habit.completions.push(today());

    Store.set("habitsLocal", localHabits);

    await loadHabits();

    toast("Привычка выполнена!", "success");
    render();
}

async function deleteHabit(id) {
    if (Backend.available) {
        try {
            await Backend.req(
                "DELETE",
                `/habits/${encodeURIComponent(id)}`,
                null,
                true
            );

            const doneToday = Store.get("habitDoneToday", {});
            delete doneToday[String(id)];

            Store.set("habitDoneToday", doneToday);

            await loadHabits();

            toast("Привычка удалена", "success");
            render();
        } catch (error) {
            toast(`Ошибка: ${error.message}`, "error");
        }

        return;
    }

    const localHabits = Store
        .get("habitsLocal", [])
        .filter((habit) => String(habit.id) !== String(id));

    Store.set("habitsLocal", localHabits);

    await loadHabits();

    toast("Привычка удалена", "success");
    render();
}

function saveTasks() {
    Store.set("tasks", state.tasks);
}

function addTask(data) {
    state.tasks.push({
        id: uid(),
        title: data.title,
        date: data.date || null,
        important: Boolean(data.important),
        urgent: Boolean(data.urgent),
        done: false,
        doneAt: null,
        createdAt: new Date().toISOString()
    });

    saveTasks();
    render();
}

function updateTask(id, patch) {
    const task = state.tasks.find((item) => item.id === id);

    if (!task) {
        return;
    }

    Object.assign(task, patch);

    saveTasks();
    render();
}

function toggleDone(id) {
    const task = state.tasks.find((item) => item.id === id);

    if (!task) {
        return;
    }

    task.done = !task.done;
    task.doneAt = task.done ? today() : null;

    saveTasks();
    render();
}

function deleteTask(id) {
    state.tasks = state.tasks.filter((task) => task.id !== id);

    saveTasks();
    render();
}

function tasksFor(view) {
    const currentDay = today();
    const tomorrow = addDays(1);
    const weekEnd = addDays(6);

    const unfinishedTasks = state.tasks.filter((task) => !task.done);

    switch (view) {
        case "today":
            return unfinishedTasks.filter(
                (task) => task.date && task.date <= currentDay
            );

        case "tomorrow":
            return unfinishedTasks.filter((task) => task.date === tomorrow);

        case "week":
            return unfinishedTasks.filter(
                (task) =>
                    task.date &&
                    task.date >= currentDay &&
                    task.date <= weekEnd
            );

        case "inbox":
            return unfinishedTasks.filter((task) => !task.date);

        default:
            return [];
    }
}

function taskRow(task) {
    const overdue = task.date && task.date < today() && !task.done;
    const safeId = esc(task.id);

    return `
        <div
            class="task ${task.done ? "done" : ""} ${overdue ? "overdue" : ""}"
            data-id="${safeId}"
        >
            <button
                type="button"
                class="task-check"
                data-act="toggle"
                aria-label="${task.done ? "Вернуть задачу в работу" : "Отметить задачу выполненной"}"
                title="${task.done ? "Вернуть в работу" : "Выполнить"}"
            ></button>

            <div
                class="task-body"
                data-act="edit"
                role="button"
                tabindex="0"
                aria-label="Редактировать задачу: ${esc(task.title)}"
            >
                <span class="task-title">${esc(task.title)}</span>

                ${
                    task.date
                        ? `
                            <span class="task-date ${overdue ? "overdue" : ""}">
                                ${esc(fmtDue(task.date))}
                                ${overdue ? " · просрочено" : ""}
                            </span>
                        `
                        : ""
                }
            </div>

            <button
                type="button"
                class="task-flag star ${task.important ? "on" : ""}"
                data-act="important"
                aria-pressed="${Boolean(task.important)}"
                aria-label="Переключить важность задачи"
                title="Важно"
            >
                <svg aria-hidden="true">
                    <use href="#i-star"></use>
                </svg>
            </button>

            <button
                type="button"
                class="task-flag flash ${task.urgent ? "on" : ""}"
                data-act="urgent"
                aria-pressed="${Boolean(task.urgent)}"
                aria-label="Переключить срочность задачи"
                title="Срочно"
            >
                <svg aria-hidden="true">
                    <use href="#i-flash"></use>
                </svg>
            </button>

            <button
                type="button"
                class="task-del"
                data-act="delete"
                aria-label="Удалить задачу: ${esc(task.title)}"
                title="Удалить"
            >
                <svg aria-hidden="true">
                    <use href="#i-x"></use>
                </svg>
            </button>
        </div>
    `;
}

function matrixCard(task) {
    return `
        <div
            class="matrix-card"
            draggable="true"
            data-id="${esc(task.id)}"
        >
            <button
                type="button"
                class="task-check"
                data-act="toggle"
                aria-label="Отметить задачу выполненной"
                title="Выполнить"
            ></button>

            <div
                class="matrix-card-body"
                data-act="edit"
                role="button"
                tabindex="0"
                aria-label="Редактировать задачу: ${esc(task.title)}"
            >
                <span class="task-title">${esc(task.title)}</span>

                ${
                    task.date
                        ? `<span class="task-date">${esc(fmtDue(task.date))}</span>`
                        : ""
                }
            </div>

            <button
                type="button"
                class="task-flag star ${task.important ? "on" : ""}"
                data-act="important"
                aria-pressed="${Boolean(task.important)}"
                aria-label="Переключить важность задачи"
                title="Важно"
            >
                <svg aria-hidden="true">
                    <use href="#i-star"></use>
                </svg>
            </button>

            <button
                type="button"
                class="task-flag flash ${task.urgent ? "on" : ""}"
                data-act="urgent"
                aria-pressed="${Boolean(task.urgent)}"
                aria-label="Переключить срочность задачи"
                title="Срочно"
            >
                <svg aria-hidden="true">
                    <use href="#i-flash"></use>
                </svg>
            </button>
        </div>
    `;
}

function habitCard(habit) {
    const dots = [];

    for (let index = 6; index >= 0; index -= 1) {
        const date = addDays(-index);

        const filled = Array.isArray(habit.completions)
            ? habit.completions.includes(date)
            : Boolean(habit.doneToday && index === 0);

        dots.push(`
            <span
                class="habit-dot ${filled ? "filled" : ""} ${index === 0 ? "today-dot" : ""}"
                title="${esc(dayLabel(date))}"
            ></span>
        `);
    }

    return `
        <div
            class="habit-card ${habit.doneToday ? "completed" : ""}"
            data-id="${esc(habit.id)}"
            data-type="habit"
        >
            <button
                type="button"
                class="habit-check"
                data-act="complete"
                aria-label="Отметить привычку «${esc(habit.name)}» выполненной"
                title="Отметить на сегодня"
                ${habit.doneToday ? "disabled" : ""}
            >
                <svg aria-hidden="true">
                    <use href="#i-check"></use>
                </svg>
            </button>

            <div class="habit-info">
                <span class="habit-name">${esc(habit.name)}</span>

                <span class="habit-meta">
                    Серия: ${Number(habit.streak) || 0} дн.
                    ${habit.doneToday ? " · выполнено сегодня" : ""}
                </span>
            </div>

            <div class="habit-week" aria-label="Выполнение привычки за последние 7 дней">
                ${dots.join("")}
            </div>

            <button
                type="button"
                class="habit-edit"
                data-act="rename"
                aria-label="Переименовать привычку «${esc(habit.name)}»"
                title="Переименовать"
            >
                <svg aria-hidden="true">
                    <use href="#i-edit"></use>
                </svg>
            </button>

            <button
                type="button"
                class="habit-del"
                data-act="delete"
                aria-label="Удалить привычку «${esc(habit.name)}»"
                title="Удалить"
            >
                <svg aria-hidden="true">
                    <use href="#i-x"></use>
                </svg>
            </button>
        </div>
    `;
}

function renderSidebar() {
    const currentDay = today();
    const tomorrow = addDays(1);
    const weekEnd = addDays(6);

    const unfinishedTasks = state.tasks.filter((task) => !task.done);

    $("#nav-count-today").textContent =
        unfinishedTasks.filter(
            (task) => task.date && task.date <= currentDay
        ).length || "";

    $("#nav-count-tomorrow").textContent =
        unfinishedTasks.filter((task) => task.date === tomorrow).length || "";

    $("#nav-count-week").textContent =
        unfinishedTasks.filter(
            (task) =>
                task.date &&
                task.date >= currentDay &&
                task.date <= weekEnd
        ).length || "";

    $("#nav-count-inbox").textContent =
        unfinishedTasks.filter((task) => !task.date).length || "";

    $$(".nav-item").forEach((button) => {
        const isActive = button.dataset.view === state.view;

        button.classList.toggle("active", isActive);

        if (isActive) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    const userArea = $("#user-area");

    if (!userArea) {
        return;
    }

    if (state.session?.username) {
        const username = state.session.username;
        const firstLetter = username.charAt(0).toUpperCase();

        userArea.innerHTML = `
            <div class="user-info">
                <span class="avatar" aria-hidden="true">${esc(firstLetter)}</span>
                <span class="user-name">${esc(username)}</span>
            </div>

            <button type="button" class="btn-ghost" id="logout-btn">
                Выйти
            </button>
        `;
    } else {
        userArea.innerHTML = `
            <button type="button" class="btn btn-primary" id="login-btn">
                <svg aria-hidden="true">
                    <use href="#i-user"></use>
                </svg>

                Войти
            </button>
        `;
    }
}

function render() {
    renderSidebar();

    $("#view-title").textContent = VIEW_TITLES[state.view] || "TickTrack";

    $("#view-date").textContent =
        state.view === "search"
            ? VIEW_META.search
            : VIEW_META[state.view] || fmtHeaderDate();

    const content = $("#content");

    if (!content) {
        return;
    }

    content.innerHTML = "";

    switch (state.view) {
        case "today":
            renderTaskList(content, "today");
            break;

        case "tomorrow":
            renderTaskList(content, "tomorrow");
            break;

        case "inbox":
            renderTaskList(content, "inbox");
            break;

        case "week":
            renderWeek(content);
            break;

        case "habits":
            renderHabits(content);
            break;

        case "matrix":
            renderMatrix(content);
            break;

        case "stats":
            renderStats(content);
            break;

        case "search":
            renderSearch(content);
            break;

        default:
            content.innerHTML = emptyState("Раздел в разработке", "#i-clock");

        console.log("HabitTracker by Artem 🚀");
    }
}

function renderTaskList(content, view) {
    const items = tasksFor(view);

    if (view === "today") {
        const overdueTasks = items.filter(
            (task) => task.date && task.date < today()
        );

        const todayTasks = items.filter(
            (task) => task.date === today()
        );

        const completedToday = state.tasks.filter(
            (task) => task.done && task.doneAt === today()
        );

        let html = "";

        if (overdueTasks.length) {
            html += `
                <div class="day-group overdue-group">
                    <div class="day-group-title">Просрочено</div>
                    ${overdueTasks.map(taskRow).join("")}
                </div>
            `;
        }

        html += `
            <div class="day-group">
                <div class="day-group-title">Сегодня</div>

                ${
                    todayTasks.length
                        ? todayTasks.map(taskRow).join("")
                        : emptyState("На сегодня задач нет", "#i-sun")
                }
            </div>
        `;

        if (completedToday.length) {
            html += `
                <details class="done-details">
                    <summary>Выполнено (${completedToday.length})</summary>
                    ${completedToday.map(taskRow).join("")}
                </details>
            `;
        }

        content.innerHTML = html;

        return;
    }

    content.innerHTML = items.length
        ? items.map(taskRow).join("")
        : emptyState("Задач нет");
}

function renderWeek(content) {
    const tasks = tasksFor("week").sort((first, second) =>
        (first.date || "").localeCompare(second.date || "")
    );

    if (!tasks.length) {
        content.innerHTML = emptyState(
            "На ближайшие 7 дней задач нет",
            "#i-calendar"
        );

        return;
    }

    const groups = {};

    for (const task of tasks) {
        if (!groups[task.date]) {
            groups[task.date] = [];
        }

        groups[task.date].push(task);
    }

    let html = "";

    for (let index = 0; index < 7; index += 1) {
        const date = addDays(index);

        if (groups[date]) {
            html += `
                <div class="day-group">
                    <div class="day-group-title">${esc(dayLabel(date))}</div>
                    ${groups[date].map(taskRow).join("")}
                </div>
            `;
        }
    }

    content.innerHTML = html;
}

function renderSearch(content) {
    const query = state.search.trim().toLowerCase();

    if (!query) {
        content.innerHTML = emptyState("Введите запрос для поиска", "#i-search");
        return;
    }

    const tasks = state.tasks.filter((task) =>
        task.title.toLowerCase().includes(query)
    );

    content.innerHTML = `
        <div class="search-results-title">Найдено: ${tasks.length}</div>

        ${
            tasks.length
                ? tasks.map(taskRow).join("")
                : emptyState("Ничего не найдено", "#i-search")
        }
    `;
}

function renderHabits(content) {
    if (Backend.available && !state.session) {
        content.innerHTML = `
            <div class="empty-state">
                <svg aria-hidden="true">
                    <use href="#i-lock"></use>
                </svg>

                <div class="empty-title">Вход не выполнен</div>

                <p>
                    Привычки хранятся на FastAPI-сервере.
                    Войдите, чтобы управлять ими.
                </p>

                <button
                    type="button"
                    class="btn btn-primary"
                    id="login-from-habits"
                >
                    Войти
                </button>
            </div>
        `;

        return;
    }

    const habits = state.habits;
    const doneToday = habits.filter((habit) => habit.doneToday).length;

    content.innerHTML = `
        <div class="habit-stats-row">
            <div class="habit-stat">
                Всего привычек: <b>${habits.length}</b>
            </div>

            <div class="habit-stat">
                Выполнено сегодня: <b>${doneToday}/${habits.length}</b>
            </div>
        </div>

        <div class="habit-add">
            <label class="sr-only" for="habit-input">
                Название новой привычки
            </label>

            <input
                type="text"
                id="habit-input"
                placeholder="Новая привычка, например: Пить 2 литра воды..."
                maxlength="120"
            >

            <button
                type="button"
                class="btn btn-primary"
                id="habit-add-btn"
            >
                <svg aria-hidden="true">
                    <use href="#i-plus"></use>
                </svg>

                Добавить
            </button>
        </div>

        <div class="habit-list">
            ${
                habits.length
                    ? habits.map(habitCard).join("")
                    : emptyState(
                        "Привычек пока нет — добавьте первую!",
                        "#i-flame"
                    )
            }
        </div>

        <div class="habit-note">
            ${
                Backend.available
                    ? "Данные привычек хранятся на FastAPI-сервере."
                    : "API-сервер не найден — демо-режим. Привычки хранятся локально в браузере."
            }
        </div>
    `;
}

function renderMatrix(content) {
    const tasks = state.tasks.filter((task) => !task.done);

    content.innerHTML = `
        <div class="matrix-intro">
            <span>
                Матрица Эйзенхауэра — приоритизация по важности и срочности.
                Перетаскивайте карточки между квадрантами или меняйте флаги.
            </span>

            <span class="matrix-legend">
                <span>
                    <svg class="legend-star" aria-hidden="true">
                        <use href="#i-star"></use>
                    </svg>
                    важно
                </span>

                <span>
                    <svg class="legend-flash" aria-hidden="true">
                        <use href="#i-flash"></use>
                    </svg>
                    срочно
                </span>
            </span>
        </div>

        <div class="matrix">
            ${MATRIX.map((quadrant) => {
                const items = tasks.filter(
                    (task) => quadrantOf(task) === quadrant.key
                );

                return `
                    <div
                        class="quadrant ${quadrant.cls}"
                        data-quadrant="${quadrant.key}"
                    >
                        <div class="quadrant-head">
                            <div>
                                <div class="quadrant-title">
                                    ${quadrant.title}
                                </div>

                                <div class="quadrant-hint">
                                    ${quadrant.hint}
                                </div>
                            </div>

                            <button
                                type="button"
                                class="quadrant-add"
                                data-quadrant-add="${quadrant.key}"
                                aria-label="Добавить задачу в квадрант «${quadrant.title}»"
                                title="Добавить задачу"
                            >
                                +
                            </button>
                        </div>

                        <div class="quadrant-body">
                            ${
                                items.length
                                    ? items.map(matrixCard).join("")
                                    : `
                                        <div class="quadrant-empty">
                                            Пусто — перетащите сюда задачу
                                        </div>
                                    `
                            }
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function statCard(label, value, icon) {
    return `
        <div class="card stat-card">
            <svg aria-hidden="true">
                <use href="${icon}"></use>
            </svg>

            <div>
                <div class="stat-value">${esc(value)}</div>
                <div class="stat-label">${esc(label)}</div>
            </div>
        </div>
    `;
}

function renderStats(content) {
    const tasks = state.tasks;
    const habits = state.habits;

    const completedTasks = tasks.filter((task) => task.done).length;
    const completedHabitsToday = habits.filter(
        (habit) => habit.doneToday
    ).length;

    const bestStreak = habits.reduce(
        (max, habit) => Math.max(max, Number(habit.streak) || 0),
        0
    );

    const days = [];

    for (let index = 6; index >= 0; index -= 1) {
        const date = addDays(-index);

        days.push({
            date,
            count: tasks.filter(
                (task) => task.done && task.doneAt === date
            ).length
        });
    }

    const maxCount = Math.max(1, ...days.map((day) => day.count));

    content.innerHTML = `
        <div class="stats-grid">
            ${statCard("Всего задач", tasks.length, "#i-inbox")}
            ${statCard("Выполнено задач", completedTasks, "#i-check")}
            ${statCard("Всего привычек", habits.length, "#i-flame")}
            ${statCard(
                "Привычек сегодня",
                completedHabitsToday,
                "#i-sun"
            )}
            ${statCard("Лучшая серия", `${bestStreak} дн.`, "#i-flash")}
        </div>

        <div class="card chart-card">
            <div class="card-title">Выполнено задач за 7 дней</div>

            <div class="chart">
                ${days.map((day) => {
                    const height = day.count
                        ? Math.max(
                            8,
                            Math.round((day.count / maxCount) * 100)
                        )
                        : 0;

                    const weekday = WEEKDAYS[
                        new Date(`${day.date}T12:00:00`).getDay()
                    ].slice(0, 2);

                    return `
                        <div class="chart-col">
                            <div class="chart-bar-wrap">
                                <div
                                    class="chart-bar"
                                    style="height: ${height}%"
                                    title="${day.count} задач"
                                ></div>
                            </div>

                            <div class="chart-label">${weekday}</div>
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
    `;
}

function openTaskModal(preset = null) {
    state.editingTaskId = null;
    state.presetQuadrant = preset;

    $("#task-modal-title").textContent = preset
        ? `Новая задача — ${quadrantTitle(preset)}`
        : "Новая задача";

    $("#task-title").value = "";
    $("#task-date").value = preset ? today() : "";

    setFlag("#flag-important", preset === "do" || preset === "schedule");
    setFlag("#flag-urgent", preset === "do" || preset === "delegate");

    openModal("#task-modal", "#task-title");
}

function openEditTaskModal(id) {
    const task = state.tasks.find((item) => item.id === id);

    if (!task) {
        return;
    }

    state.editingTaskId = id;
    state.presetQuadrant = null;

    $("#task-modal-title").textContent = "Редактировать задачу";
    $("#task-title").value = task.title;
    $("#task-date").value = task.date || "";

    setFlag("#flag-important", Boolean(task.important));
    setFlag("#flag-urgent", Boolean(task.urgent));

    openModal("#task-modal", "#task-title");
}

function setFlag(selector, enabled) {
    const button = $(selector);

    if (!button) {
        return;
    }

    button.classList.toggle("on", enabled);
    button.setAttribute("aria-pressed", String(enabled));
}

function toggleFlag(button) {
    const enabled = !button.classList.contains("on");

    button.classList.toggle("on", enabled);
    button.setAttribute("aria-pressed", String(enabled));
}

function saveTask() {
    const title = $("#task-title").value.trim();

    if (!title) {
        toast("Введите название задачи", "error");
        $("#task-title").focus();
        return;
    }

    const data = {
        title,
        date: $("#task-date").value || null,
        important: $("#flag-important").classList.contains("on"),
        urgent: $("#flag-urgent").classList.contains("on")
    };

    if (state.editingTaskId) {
        updateTask(state.editingTaskId, data);
        toast("Задача обновлена", "success");
    } else {
        addTask(data);
        toast("Задача добавлена", "success");
    }

    hide($("#task-modal"));
}

function confirmModal(text, action) {
    $("#confirm-text").textContent = text;
    state.confirmAction = action;

    openModal("#confirm-modal", "#confirm-ok");
}

function openAuth(hint = "") {
    $("#auth-error").textContent = "";

    const hintElement = $("#auth-hint");

    if (hintElement) {
        hintElement.textContent =
            hint ||
            (
                Backend.available
                    ? ""
                    : "API-сервер не найден — аккаунты хранятся локально в браузере."
            );
    }

    $("#auth-username").value = "";
    $("#auth-password").value = "";

    openModal("#auth-modal", "#auth-username");
}

function setAuthError(message) {
    const errorElement = $("#auth-error");

    if (errorElement) {
        errorElement.textContent = message;
    }
}

async function handleLogin(username, password) {
    if (!username || !password) {
        setAuthError("Заполните имя пользователя и пароль");
        return;
    }

    if (Backend.available) {
        try {
            const data = await Backend.req("POST", "/token", {
                username,
                password
            });

            state.session = {
                username,
                token: data.access_token
            };

            Store.set("session", state.session);

            hide($("#auth-modal"));
            toast(`Добро пожаловать, ${username}!`, "success");

            await loadHabits();
            render();
        } catch (error) {
            setAuthError(error.message);
        }

        return;
    }

    const users = Store.get("users", []);

    const user = users.find(
        (item) =>
            item.username === username &&
            item.password === localHash(password)
    );

    if (!user) {
        setAuthError("Неверное имя пользователя или пароль");
        return;
    }

    state.session = {
        username,
        token: `local-${uid()}`
    };

    Store.set("session", state.session);

    hide($("#auth-modal"));
    toast(`Добро пожаловать, ${username}!`, "success");

    await loadHabits();
    render();
}

async function handleRegister(username, password) {
    if (!username || !password) {
        setAuthError("Заполните имя пользователя и пароль");
        return;
    }

    if (username.length < 3) {
        setAuthError("Имя пользователя должно содержать минимум 3 символа");
        return;
    }

    if (password.length < 4) {
        setAuthError("Пароль должен содержать минимум 4 символа");
        return;
    }

    if (Backend.available) {
        try {
            await Backend.req("POST", "/register", {
                username,
                password
            });

            authMode = "login";

            $$(".auth-tab").forEach((tab) => {
                const selected = tab.dataset.tab === "login";

                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
            });

            $("#auth-title").textContent = "Вход";
            $("#auth-submit").textContent = "Войти";
            $("#auth-password").value = "";

            setAuthError("");
            toast("Пользователь создан. Теперь войдите.", "success");
        } catch (error) {
            setAuthError(error.message);
        }

        return;
    }

    const users = Store.get("users", []);

    if (users.some((item) => item.username === username)) {
        setAuthError("Это имя пользователя уже занято");
        return;
    }

    users.push({
        username,
        password: localHash(password)
    });

    Store.set("users", users);

    state.session = {
        username,
        token: `local-${uid()}`
    };

    Store.set("session", state.session);

    hide($("#auth-modal"));
    toast(`Аккаунт создан: ${username}`, "success");

    await loadHabits();
    render();
}

async function logout() {
    state.session = null;
    Store.set("session", null);

    toast("Вы вышли из аккаунта");

    await loadHabits();
    render();
}

function applyTheme() {
    const dark = Store.get("theme", "light") === "dark";

    document.body.classList.toggle("dark", dark);

    const themeLabel = $("#theme-label");
    const themeButton = $("#theme-btn");

    if (themeLabel) {
        themeLabel.textContent = dark ? "Светлая тема" : "Тёмная тема";
    }

    if (themeButton) {
        themeButton.setAttribute("aria-pressed", String(dark));
    }
}

function renderApiStatus() {
    const element = $("#api-status");

    if (!element) {
        return;
    }

    if (Backend.available) {
        element.classList.add("ok");

        element.innerHTML = `
            <span class="dot" aria-hidden="true"></span>
            <span>FastAPI подключён</span>
        `;
    } else {
        element.classList.remove("ok");

        element.innerHTML = `
            <span class="dot" aria-hidden="true"></span>
            <span>Локальный режим (API не найден)</span>
        `;
    }
}

function isHabitRow(element) {
    return element?.closest('[data-type="habit"]');
}

function handleContentAction(event) {
    if (event.target.closest("#login-from-habits")) {
        openAuth();
        return;
    }

    const addHabitButton = event.target.closest("#habit-add-btn");

    if (addHabitButton) {
        const input = $("#habit-input");

        if (input) {
            addHabit(input.value);
        }

        return;
    }

    const quadrantAddButton = event.target.closest("[data-quadrant-add]");

    if (quadrantAddButton) {
        openTaskModal(quadrantAddButton.dataset.quadrantAdd);
        return;
    }

    const actionElement = event.target.closest("[data-act]");

    if (!actionElement) {
        return;
    }

    const row = actionElement.closest("[data-id]");

    if (!row) {
        return;
    }

    const id = row.dataset.id;
    const action = actionElement.dataset.act;

    const habitRow = isHabitRow(actionElement);

    if (habitRow) {
        const habit = state.habits.find(
            (item) => String(item.id) === String(id)
        );

        if (action === "complete") {
            completeHabit(id);
        }

        if (action === "rename" && habit) {
            const name = prompt("Новое название привычки:", habit.name);

            if (name?.trim()) {
                renameHabit(id, name);
            }
        }

        if (action === "delete" && habit) {
            confirmModal(
                `Удалить привычку «${habit.name}»?`,
                () => deleteHabit(id)
            );
        }

        return;
    }

    if (action === "toggle") {
        toggleDone(id);
        return;
    }

    if (action === "edit") {
        openEditTaskModal(id);
        return;
    }

    if (action === "important") {
        const task = state.tasks.find((item) => item.id === id);

        if (task) {
            updateTask(id, {
                important: !task.important
            });
        }

        return;
    }

    if (action === "urgent") {
        const task = state.tasks.find((item) => item.id === id);

        if (task) {
            updateTask(id, {
                urgent: !task.urgent
            });
        }

        return;
    }

    if (action === "delete") {
        const task = state.tasks.find((item) => item.id === id);

        if (task) {
            confirmModal(
                `Удалить задачу «${task.title}»?`,
                () => deleteTask(id)
            );
        }
    }
}

function bindEvents() {
    $$(".nav-item").forEach((button) => {
        button.addEventListener("click", () => {
            state.view = button.dataset.view;
            state.search = "";

            const searchInput = $("#search-input");

            if (searchInput) {
                searchInput.value = "";
            }

            render();
        });
    });

    $("#header-add-btn")?.addEventListener("click", () => {
        openTaskModal();
    });

    $("#search-input")?.addEventListener("input", (event) => {
        const value = event.target.value.trim();

        if (value) {
            if (state.view !== "search") {
                prevView = state.view;
            }

            state.view = "search";
        } else {
            state.view = prevView || "today";
        }

        state.search = value.toLowerCase();
        render();
    });

    $("#content")?.addEventListener("click", handleContentAction);

    $("#content")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.id === "habit-input") {
            addHabit(event.target.value);
            return;
        }

        if (
            event.key === "Enter" &&
            (
                event.target.classList.contains("task-body") ||
                event.target.classList.contains("matrix-card-body")
            )
        ) {
            const row = event.target.closest("[data-id]");

            if (row) {
                openEditTaskModal(row.dataset.id);
            }
        }
    });

    $("#content")?.addEventListener("dragstart", (event) => {
        const card = event.target.closest(".matrix-card");

        if (!card || !event.dataTransfer) {
            return;
        }

        event.dataTransfer.setData("text/plain", card.dataset.id);
        event.dataTransfer.effectAllowed = "move";

        card.classList.add("dragging");
    });

    $("#content")?.addEventListener("dragend", () => {
        $("#content .dragging")?.classList.remove("dragging");

        $$("#content .quadrant.drag-over").forEach((quadrant) => {
            quadrant.classList.remove("drag-over");
        });
    });

    $("#content")?.addEventListener("dragover", (event) => {
        const quadrant = event.target.closest(".quadrant");

        if (!quadrant) {
            return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }

        quadrant.classList.add("drag-over");
    });

    $("#content")?.addEventListener("dragleave", (event) => {
        const quadrant = event.target.closest(".quadrant");

        if (
            quadrant &&
            event.relatedTarget instanceof Node &&
            !quadrant.contains(event.relatedTarget)
        ) {
            quadrant.classList.remove("drag-over");
        }
    });

    $("#content")?.addEventListener("drop", (event) => {
        const quadrant = event.target.closest(".quadrant");

        if (!quadrant || !event.dataTransfer) {
            return;
        }

        event.preventDefault();
        quadrant.classList.remove("drag-over");

        const id = event.dataTransfer.getData("text/plain");

        const task = state.tasks.find((item) => item.id === id);

        if (!task) {
            return;
        }

        const quadrantFlags = {
            do: [true, true],
            schedule: [true, false],
            delegate: [false, true],
            eliminate: [false, false]
        };

        const flags = quadrantFlags[quadrant.dataset.quadrant];

        if (!flags) {
            return;
        }

        updateTask(id, {
            important: flags[0],
            urgent: flags[1]
        });

        toast(
            `Задача перемещена: «${quadrantTitle(quadrant.dataset.quadrant)}»`,
            "success"
        );
    });

    document.addEventListener("click", (event) => {
        if (event.target.closest("#login-btn")) {
            openAuth();
            return;
        }

        if (event.target.closest("#logout-btn")) {
            logout();
            return;
        }

        const closeButton = event.target.closest("[data-close]");

        if (closeButton) {
            hide($(`#${closeButton.dataset.close}`));
        }
    });

    $$(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                hide(overlay);
            }
        });
    });

    $$(".auth-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            authMode = tab.dataset.tab;

            $$(".auth-tab").forEach((item) => {
                const selected = item === tab;

                item.classList.toggle("active", selected);
                item.setAttribute("aria-selected", String(selected));
            });

            $("#auth-title").textContent =
                authMode === "login" ? "Вход" : "Регистрация";

            $("#auth-submit").textContent =
                authMode === "login" ? "Войти" : "Создать аккаунт";

            setAuthError("");
        });
    });

    $("#auth-submit")?.addEventListener("click", () => {
        const username = $("#auth-username").value.trim();
        const password = $("#auth-password").value;

        if (authMode === "login") {
            handleLogin(username, password);
        } else {
            handleRegister(username, password);
        }
    });

    $("#auth-modal")?.addEventListener("keydown", (event) => {
        if (
            event.key === "Enter" &&
            (
                event.target.id === "auth-username" ||
                event.target.id === "auth-password"
            )
        ) {
            $("#auth-submit")?.click();
        }
    });

    $$(".flag-toggle").forEach((button) => {
        button.addEventListener("click", () => {
            toggleFlag(button);
        });
    });

    $("#task-save")?.addEventListener("click", saveTask);

    $("#task-modal")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.id === "task-title") {
            saveTask();
        }
    });

    $("#confirm-ok")?.addEventListener("click", () => {
        const action = state.confirmAction;

        state.confirmAction = null;

        hide($("#confirm-modal"));

        if (typeof action === "function") {
            action();
        }
    });

    $("#theme-btn")?.addEventListener("click", () => {
        const nextTheme = document.body.classList.contains("dark")
            ? "light"
            : "dark";

        Store.set("theme", nextTheme);
        applyTheme();
    });

    $("#api-status")?.addEventListener("click", () => {
        const url = prompt("URL FastAPI-сервера:", Backend.base);

        if (url?.trim()) {
            Store.set("apiUrl", url.trim());
            window.location.reload();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            $$(".modal-overlay:not(.hidden)").forEach((modal) => {
                hide(modal);
            });
        }
    });
}

async function init() {
    applyTheme();
    seedDemo();

    await Backend.check();

    renderApiStatus();

    await loadHabits();

    bindEvents();
    render();
}

document.addEventListener("DOMContentLoaded", init);