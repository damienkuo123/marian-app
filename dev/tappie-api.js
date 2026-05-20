// tappie-api.js
// Tappie Supabase Dev API Layer
// 重要：請把 YOUR_PROJECT_REF 換成你的 Supabase 專案 ref。
// 範例：https://abcd1234.supabase.co/functions/v1

window.TappieAPI = {
  mode: "supabase-dev",
  supabaseBaseUrl: "https://diptahklguohjtjnwnbf.supabase.co/functions/v1",

  endpoints: {
    resolveStudent: "/resolve-student",
    getDashboard: "/get-dashboard",
    getAzureToken: "/get-azure-token",
    submitPractice: "/submit-practice",
    getDiagnosticReport: "/get-diagnostic-report"
  },

  async request(path, options = {}) {
    const res = await fetch(`${this.supabaseBaseUrl}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const message = data.message || data.msg || data.error || `API error: ${res.status}`;
      const err = new Error(message);
      err.payload = data;
      throw err;
    }
    return data;
  },

  resolveStudentByUid(uid) {
    return this.request(`${this.endpoints.resolveStudent}?uid=${encodeURIComponent(uid)}`);
  },

  resolveStudentByCard(cardId) {
    return this.request(`${this.endpoints.resolveStudent}?cardId=${encodeURIComponent(cardId)}`);
  },

  getDashboard(uid) {
    return this.request(`${this.endpoints.getDashboard}?uid=${encodeURIComponent(uid)}`);
  },

  getAzureToken() {
    return this.request(this.endpoints.getAzureToken);
  },

  submitPractice(payload) {
    return this.request(this.endpoints.submitPractice, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },

  getDiagnosticReport(uid, filter = "unit") {
    return this.request(`${this.endpoints.getDiagnosticReport}?uid=${encodeURIComponent(uid)}&filter=${encodeURIComponent(filter)}`);
  },

  // 將 Supabase get-dashboard 回傳格式轉成舊 dashboard.html 的 renderDashboard(data) 可吃的格式。
  toLegacyDashboard(data) {
    const student = data.student || {};
    const usage = data.usage || {};
    const currentUnit = data.currentUnit || null;
    const leaderboard = data.leaderboard || [];
    const recentAttempts = data.recentAttempts || [];

    const lastScore = recentAttempts.length > 0 ? Number(recentAttempts[0].score || 0) : 0;
    const missionCount = recentAttempts.length;

    return {
      success: true,
      uid: student.uid,
      studentName: student.name || "Tappie 學生",
      currentPoints: Number(student.points || 0),
      studentType: student.studentType || "normal",
      parentEmail: student.parentEmail || "",
      currentUnit: currentUnit ? currentUnit.unitName : "未排定",
      endDate: currentUnit ? formatMonthDay(currentUnit.endDate) : "--/--",
      isCompleted: lastScore >= 60,
      lastScore,
      awardedPoints: calculateReward(lastScore),
      missionCount,
      leaderboard: leaderboard.map(item => ({
        uid: item.uid,
        name: item.name,
        score: item.score
      })),
      reviewUnits: currentUnit ? [currentUnit.unitName] : [],
      recentLogs: recentAttempts.map(item => ({
        time: formatDateTime(item.createdAt),
        reason: `${item.word || item.unitName || "口說練習"}`,
        val: Number(item.score || 0)
      })),
      gamification: defaultGamification(),
      logoUrl: "",
      iconUrl: ""
    };
  }
};

function calculateReward(score) {
  const s = Number(score || 0);
  if (s >= 80) return 30;
  if (s >= 70) return 20;
  if (s >= 60) return 10;
  return 0;
}

function formatMonthDay(value) {
  if (!value) return "--/--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function defaultGamification() {
  return {
    dailyChallenge: {
      passScore: 60,
      tiers: [
        { min: 80, pts: 30 },
        { min: 70, pts: 20 },
        { min: 60, pts: 10 }
      ]
    },
    mission: {
      failThreshold: 5,
      failBasePenalty: -250,
      failPenaltyStep: 50,
      goodThreshold: 10,
      goodReward: 100,
      perfectThreshold: 15,
      perfectReward: 200
    },
    leaderboard: [100, 50, 30]
  };
}
