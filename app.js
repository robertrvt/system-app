const STORAGE_KEY = "systemRPG_v2";
const OLD_STORAGE_KEY = "systemPlayerData";

const defaultState = () => ({
  level: 1,
  xp: 0,
  stats: {
    strength: 0,
    intelligence: 0,
    discipline: 0,
    health: 0,
    endurance: 0
  },
  quests: [],
  activityDates: []
});

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw) {
    try {
      return normalizeState(JSON.parse(raw));
    } catch (_) {}
  }

  const fresh = defaultState();
  const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);

  if (oldRaw) {
    try {
      const old = JSON.parse(oldRaw);

      fresh.level = clampInt(old.level, 1, 999, 1);
      fresh.xp = clampInt(old.xp, 0, 99, 0);
    } catch (_) {}
  }

  return fresh;
}

function normalizeState(value) {
  const fresh = defaultState();

  if (!value || typeof value !== "object") {
    return fresh;
  }

  fresh.level = clampInt(value.level, 1, 999, 1);
  fresh.xp = clampInt(value.xp, 0, 99, 0);

  fresh.stats = {
    ...fresh.stats,
    ...(value.stats || {})
  };

  for (const key of Object.keys(fresh.stats)) {
    fresh.stats[key] = clampInt(
      fresh.stats[key],
      0,
      999999,
      0
    );
  }

  fresh.quests = Array.isArray(value.quests)
    ? value.quests
        .map(normalizeQuest)
        .filter(Boolean)
        .slice(0, 500)
    : [];

  fresh.activityDates = Array.isArray(value.activityDates)
    ? [
        ...new Set(
          value.activityDates.filter(
            x => /^\d{4}-\d{2}-\d{2}$/.test(x)
          )
        )
      ].slice(-2000)
    : [];

  return fresh;
}

function normalizeQuest(q) {
  if (!q || typeof q !== "object") {
    return null;
  }

  const name = String(q.name || "")
    .trim()
    .slice(0, 80);

  if (!name) {
    return null;
  }

  const repeat = [
    "daily",
    "weekly",
    "once"
  ].includes(q.repeat)
    ? q.repeat
    : "daily";

  const stat = [
    "none",
    "strength",
    "intelligence",
    "discipline",
    "health",
    "endurance"
  ].includes(q.stat)
    ? q.stat
    : "none";

  return {
    id: String(q.id || makeId()),
    name,
    xp: clampInt(q.xp, 1, 1000, 25),
    repeat,
    stat,
    statAmount:
      stat === "none"
        ? 0
        : clampInt(q.statAmount, 0, 100, 1),
    completedKey: String(q.completedKey || "")
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, n)
  );
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}

function makeId() {
  if (
    crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function dateKey(date = new Date()) {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function weeklyKey(date = new Date()) {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  return "week-" + dateKey(d);
}

function currentCompletionKey(quest) {
  if (quest.repeat === "daily") {
    return dateKey();
  }

  if (quest.repeat === "weekly") {
    return weeklyKey();
  }

  return "once";
}

function isCompleted(quest) {
  return (
    quest.completedKey ===
    currentCompletionKey(quest)
  );
}

function xpNeeded() {
  return 100;
}

function getRank(level) {
  if (level >= 30) return "S";
  if (level >= 25) return "A";
  if (level >= 20) return "B";
  if (level >= 15) return "C";
  if (level >= 8) return "D";

  return "E";
}

function gainRewards(quest) {
  state.xp += quest.xp;

  let leveled = false;

  while (state.xp >= xpNeeded()) {
    state.xp -= xpNeeded();
    state.level += 1;
    leveled = true;
  }

  if (quest.stat !== "none") {
    state.stats[quest.stat] += quest.statAmount;
  }

  if (!state.activityDates.includes(dateKey())) {
    state.activityDates.push(dateKey());
  }

  if (state.activityDates.length > 2000) {
    state.activityDates =
      state.activityDates.slice(-2000);
  }

  saveState();
  render();

  showToast(
    leveled
      ? `LEVEL UP — LEVEL ${state.level}`
      : `QUEST COMPLETE +${quest.xp} XP`
  );
}

function completeQuest(id) {
  const quest = state.quests.find(
    q => q.id === id
  );

  if (!quest || isCompleted(quest)) {
    return;
  }

  quest.completedKey =
    currentCompletionKey(quest);

  gainRewards(quest);
}

function streakCount() {
  const set = new Set(state.activityDates);

  let cursor = new Date();

  if (!set.has(dateKey(cursor))) {
    cursor.setDate(
      cursor.getDate() - 1
    );
  }

  let count = 0;

  while (set.has(dateKey(cursor))) {
    count += 1;

    cursor.setDate(
      cursor.getDate() - 1
    );
  }

  return count;
}

function repeatLabel(value) {
  if (value === "daily") {
    return "Daily";
  }

  if (value === "weekly") {
    return "Weekly";
  }

  return "One-time";
}

function statLabel(value) {
  if (value === "none") {
    return "No stat reward";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>'"]/g,
    ch =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[ch]
  );
}

function render() {
  document.getElementById(
    "level"
  ).textContent = `LEVEL ${state.level}`;

  document.getElementById(
    "rank"
  ).textContent = getRank(state.level);

  document.getElementById(
    "xpText"
  ).textContent =
    `${state.xp} / ${xpNeeded()} XP`;

  document.getElementById(
    "xpFill"
  ).style.width =
    `${Math.min(
      100,
      (state.xp / xpNeeded()) * 100
    )}%`;

  const streak = streakCount();

  document.getElementById(
    "streak"
  ).textContent =
    `${streak} ${
      streak === 1
        ? "DAY"
        : "DAYS"
    }`;

  for (
    const key of Object.keys(state.stats)
  ) {
    document.getElementById(
      `stat-${key}`
    ).textContent =
      state.stats[key];
  }

  const list =
    document.getElementById("questList");

  const empty =
    document.getElementById("emptyState");

  empty.style.display =
    state.quests.length
      ? "none"
      : "block";

  list.innerHTML =
    state.quests
      .map(q => {
        const done =
          isCompleted(q);

        const statText =
          q.stat === "none"
            ? ""
            : ` • +${q.statAmount} ${statLabel(q.stat)}`;

        const doneText =
          q.repeat === "weekly"
            ? "Completed this week"
            : q.repeat === "daily"
            ? "Completed today"
            : "Completed";

        return `
          <article class="quest">

            <div class="quest-name">
              ${escapeHtml(q.name)}
            </div>

            <div class="quest-meta">
              ${repeatLabel(q.repeat)}
              • +${q.xp} XP
              ${statText}
            </div>

            <div class="quest-actions">

              <button
                class="primary small complete ${
                  done ? "done" : ""
                }"
                data-action="complete"
                data-id="${escapeHtml(q.id)}"
                ${done ? "disabled" : ""}
              >
                ${
                  done
                    ? doneText
                    : "Complete"
                }
              </button>

              <button
                class="secondary small"
                data-action="edit"
                data-id="${escapeHtml(q.id)}"
              >
                Edit
              </button>

              <button
                class="danger small"
                data-action="delete"
                data-id="${escapeHtml(q.id)}"
              >
                Delete
              </button>

            </div>

          </article>
        `;
      })
      .join("");
}

function showToast(text) {
  const el =
    document.getElementById("toast");

  el.textContent = text;
  el.style.display = "block";

  clearTimeout(showToast.timer);

  showToast.timer =
    setTimeout(() => {
      el.style.display = "none";
    }, 2200);
}

const modal =
  document.getElementById("questModal");

const form =
  document.getElementById("questForm");

function openQuestModal(
  quest = null
) {
  document.getElementById(
    "modalTitle"
  ).textContent =
    quest
      ? "EDIT QUEST"
      : "ADD QUEST";

  document.getElementById(
    "questId"
  ).value =
    quest
      ? quest.id
      : "";

  document.getElementById(
    "questName"
  ).value =
    quest
      ? quest.name
      : "";

  document.getElementById(
    "questXp"
  ).value =
    quest
      ? quest.xp
      : 25;

  document.getElementById(
    "questRepeat"
  ).value =
    quest
      ? quest.repeat
      : "daily";

  document.getElementById(
    "questStat"
  ).value =
    quest
      ? quest.stat
      : "none";

  document.getElementById(
    "questStatAmount"
  ).value =
    quest
      ? quest.statAmount
      : 1;

  modal.hidden = false;

  setTimeout(
    () =>
      document
        .getElementById("questName")
        .focus(),
    50
  );
}

function closeQuestModal() {
  modal.hidden = true;
}

document
  .getElementById("addQuest")
  .addEventListener(
    "click",
    () => openQuestModal()
  );

document
  .getElementById("cancelQuest")
  .addEventListener(
    "click",
    closeQuestModal
  );

modal.addEventListener(
  "click",
  e => {
    if (e.target === modal) {
      closeQuestModal();
    }
  }
);

form.addEventListener(
  "submit",
  e => {
    e.preventDefault();

    const id =
      document.getElementById(
        "questId"
      ).value;

    const name =
      document.getElementById(
        "questName"
      ).value
        .trim()
        .slice(0, 80);

    const xp =
      clampInt(
        document.getElementById(
          "questXp"
        ).value,
        1,
        1000,
        25
      );

    const repeat =
      document.getElementById(
        "questRepeat"
      ).value;

    const stat =
      document.getElementById(
        "questStat"
      ).value;

    const statAmount =
      stat === "none"
        ? 0
        : clampInt(
            document.getElementById(
              "questStatAmount"
            ).value,
            0,
            100,
            1
          );

    if (!name) {
      return;
    }

    if (id) {
      const quest =
        state.quests.find(
          q => q.id === id
        );

      if (quest) {
        const repeatChanged =
          quest.repeat !== repeat;

        Object.assign(
          quest,
          {
            name,
            xp,
            repeat,
            stat,
            statAmount
          }
        );

        if (repeatChanged) {
          quest.completedKey = "";
        }
      }
    } else {
      state.quests.push({
        id: makeId(),
        name,
        xp,
        repeat,
        stat,
        statAmount,
        completedKey: ""
      });
    }

    saveState();
    closeQuestModal();
    render();

    showToast(
      id
        ? "QUEST UPDATED"
        : "QUEST ADDED"
    );
  }
);

document
  .getElementById("questList")
  .addEventListener(
    "click",
    e => {
      const button =
        e.target.closest(
          "button[data-action]"
        );

      if (!button) {
        return;
      }

      const id =
        button.dataset.id;

      const quest =
        state.quests.find(
          q => q.id === id
        );

      if (!quest) {
        return;
      }

      if (
        button.dataset.action ===
        "complete"
      ) {
        completeQuest(id);
      }

      if (
        button.dataset.action ===
        "edit"
      ) {
        openQuestModal(quest);
      }

      if (
        button.dataset.action ===
        "delete"
      ) {
        if (
          confirm(
            `Delete quest “${quest.name}”?`
          )
        ) {
          state.quests =
            state.quests.filter(
              q => q.id !== id
            );

          saveState();
          render();

          showToast(
            "QUEST DELETED"
          );
        }
      }
    }
  );

document
  .getElementById("exportBtn")
  .addEventListener(
    "click",
    () => {
      const backup = {
        version: 2,
        exportedAt:
          new Date().toISOString(),
        data: state
      };

      const blob =
        new Blob(
          [
            JSON.stringify(
              backup,
              null,
              2
            )
          ],
          {
            type:
              "application/json"
          }
        );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      a.href = url;

      a.download =
        `system-backup-${dateKey()}.json`;

      document.body.appendChild(a);

      a.click();

      a.remove();

      setTimeout(
        () =>
          URL.revokeObjectURL(url),
        1000
      );

      showToast(
        "BACKUP EXPORTED"
      );
    }
  );

document
  .getElementById("importBtn")
  .addEventListener(
    "click",
    () => {
      document
        .getElementById(
          "importFile"
        )
        .click();
    }
  );

document
  .getElementById("importFile")
  .addEventListener(
    "change",
    e => {
      const file =
        e.target.files &&
        e.target.files[0];

      if (!file) {
        return;
      }

      const reader =
        new FileReader();

      reader.onload = () => {
        try {
          const parsed =
            JSON.parse(
              String(
                reader.result
              )
            );

          const candidate =
            parsed &&
            parsed.data
              ? parsed.data
              : parsed;

          if (
            !candidate ||
            typeof candidate !==
              "object"
          ) {
            throw new Error(
              "Invalid backup"
            );
          }

          if (
            !confirm(
              "Import this backup? It will replace the progress currently stored on this device."
            )
          ) {
            return;
          }

          state =
            normalizeState(
              candidate
            );

          saveState();
          render();

          showToast(
            "BACKUP IMPORTED"
          );
        } catch (_) {
          alert(
            "That file does not look like a valid SYSTEM backup."
          );
        } finally {
          e.target.value = "";
        }
      };

      reader.readAsText(file);
    }
  );

saveState();
render();
