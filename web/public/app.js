const state = {
  reports: [],
  activeFile: new URLSearchParams(location.search).get("report"),
  markdown: "",
  renderedText: "",
  query: "",
  observer: null,
  archiveView: "all",
  favorites: new Set(loadFavorites()),
};

function loadFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem("report-favorites") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const elements = {
  archiveCount: document.querySelector("#archiveCount"),
  archiveList: document.querySelector("#archiveList"),
  allReportsTab: document.querySelector("#allReportsTab"),
  closeSidebar: document.querySelector("#closeSidebar"),
  currentDate: document.querySelector("#currentDate"),
  favoritesTab: document.querySelector("#favoritesTab"),
  openSidebar: document.querySelector("#openSidebar"),
  printButton: document.querySelector("#printButton"),
  progressBar: document.querySelector("#progressBar"),
  refreshButton: document.querySelector("#refreshButton"),
  report: document.querySelector("#report"),
  scrim: document.querySelector("#scrim"),
  searchInput: document.querySelector("#searchInput"),
  themeButton: document.querySelector("#themeButton"),
  tocList: document.querySelector("#tocList"),
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value, index) {
  const slug = value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return slug || `section-${index}`;
}

function renderInline(source) {
  let text = escapeHtml(source);
  const code = [];
  text = text.replace(/`([^`]+)`/g, (_, content) => {
    code.push(`<code>${content}</code>`);
    return `\u0000CODE${code.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => code[Number(index)]);
  return text;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];
  let headingIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(" ")).replaceAll("\u0000BR\u0000", "<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCode) {
        output.push(`<pre><code data-language="${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const publication = line.match(/^\*\*(大模型研究热点·\s*\d{4}\s*年第\s*\d+\s*周)\*\*$/);
    if (publication) {
      flushParagraph();
      closeList();
      output.push(`<p class="report-publication">${renderInline(publication[1])}</p>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      headingIndex += 1;
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      const id = slugify(heading[2], headingIndex);
      output.push(`<h${level} id="${id}">${content}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeList();
      output.push("<hr>");
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      closeList();
      output.push(`<blockquote><p>${renderInline(line.slice(2))}</p></blockquote>`);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
      continue;
    }
    paragraph.push(line.endsWith("  ") ? `${line.trim()}\u0000BR\u0000` : line.trim());
  }
  flushParagraph();
  closeList();
  return output.join("\n");
}

function formatDate(date) {
  if (!date) return "未标注日期";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function reportMatches(report, query) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return `${report.title} ${report.publication || ""} ${report.date} ${report.summary}`.toLowerCase().includes(term) || (report.file === state.activeFile && state.renderedText.toLowerCase().includes(term));
}

function renderArchiveList() {
  const visibleReports = state.reports.filter((report) => {
    const inView = state.archiveView === "all" || state.favorites.has(report.file);
    return inView && reportMatches(report, state.query);
  });
  elements.archiveList.replaceChildren();
  for (const report of visibleReports) {
    const row = document.createElement("div");
    row.className = "archive-row";
    row.dataset.current = String(report.file === state.activeFile);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-item";
    button.dataset.file = report.file;
    button.setAttribute("aria-current", String(report.file === state.activeFile));

    const date = document.createElement("span");
    date.className = "archive-date";
    date.textContent = report.date.slice(5).replace("-", "/");
    const copy = document.createElement("span");
    copy.className = "archive-copy";
    const title = document.createElement("strong");
    title.textContent = report.title.replace(/^大模型研究周报\s*·\s*/, "");
    const summary = document.createElement("span");
    summary.textContent = report.summary || "本期研究周报";
    copy.append(title, summary);
    button.append(copy);
    button.addEventListener("click", () => loadReport(report.file));

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "favorite-button";
    const isFavorite = state.favorites.has(report.file);
    favoriteButton.textContent = isFavorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.setAttribute("aria-label", isFavorite ? `取消收藏 ${report.title}` : `收藏 ${report.title}`);
    favoriteButton.title = isFavorite ? "取消收藏" : "收藏";
    favoriteButton.addEventListener("click", () => toggleFavorite(report.file));

    const meta = document.createElement("div");
    meta.className = "archive-meta";
    meta.append(date, favoriteButton);

    row.append(meta, button);
    elements.archiveList.append(row);
  }

  if (!visibleReports.length) {
    const empty = document.createElement("div");
    empty.className = "archive-empty";
    const label = document.createElement("span");
    label.textContent = state.archiveView === "favorites" && !state.query ? "暂无收藏" : "无匹配结果";
    empty.append(label);
    elements.archiveList.append(empty);
  }
}

function updateArchiveHeader() {
  const favoriteCount = state.reports.filter((report) => state.favorites.has(report.file)).length;
  elements.archiveCount.textContent = `${state.reports.length} 期归档 · ${favoriteCount} 收藏`;
}

function setArchiveView(view) {
  state.archiveView = view;
  elements.allReportsTab.setAttribute("aria-selected", String(view === "all"));
  elements.favoritesTab.setAttribute("aria-selected", String(view === "favorites"));
  elements.allReportsTab.tabIndex = view === "all" ? 0 : -1;
  elements.favoritesTab.tabIndex = view === "favorites" ? 0 : -1;
  renderArchiveList();
}

function toggleFavorite(file) {
  if (state.favorites.has(file)) state.favorites.delete(file);
  else state.favorites.add(file);
  localStorage.setItem("report-favorites", JSON.stringify([...state.favorites]));
  updateArchiveHeader();
  renderArchiveList();
}

function highlightCurrentReport() {
  for (const item of elements.archiveList.querySelectorAll(".archive-item")) {
    const isCurrent = item.dataset.file === state.activeFile;
    item.setAttribute("aria-current", String(isCurrent));
    item.closest(".archive-row").dataset.current = String(isCurrent);
  }
}

function buildToc() {
  state.observer?.disconnect();
  elements.tocList.replaceChildren();
  const headings = [...elements.report.querySelectorAll("h2, h3")];
  const links = headings.map((heading) => {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.dataset.level = heading.tagName.slice(1);
    link.textContent = heading.textContent;
    elements.tocList.append(link);
    return link;
  });
  state.observer = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting);
    if (!visible) return;
    for (const link of links) link.classList.toggle("active", link.hash === `#${visible.target.id}`);
  }, { rootMargin: "-15% 0px -70% 0px" });
  headings.forEach((heading) => state.observer.observe(heading));
}

function highlightQuery(query) {
  if (!query.trim()) return;
  const normalized = query.trim().toLowerCase();
  const walker = document.createTreeWalker(elements.report, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement.closest("a, code, mark") && walker.currentNode.nodeValue.toLowerCase().includes(normalized)) nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const index = node.nodeValue.toLowerCase().indexOf(normalized);
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + query.trim().length);
    const mark = document.createElement("mark");
    range.surroundContents(mark);
  }
  elements.report.querySelector("mark")?.scrollIntoView({ block: "center" });
}

async function loadReports({ preserve = true } = {}) {
  const response = await fetch("/api/reports");
  if (!response.ok) throw new Error("无法读取归档列表");
  state.reports = await response.json();
  updateArchiveHeader();
  if (!preserve || !state.reports.some((report) => report.file === state.activeFile)) state.activeFile = state.reports[0]?.file || null;
  renderArchiveList();
  return state.activeFile;
}

async function loadReport(file) {
  if (!file) {
    elements.report.innerHTML = '<div class="empty-state"><p>“周报”目录中还没有 Markdown 文件。</p></div>';
    return;
  }
  state.activeFile = file;
  history.replaceState(null, "", `?report=${encodeURIComponent(file)}`);
  highlightCurrentReport();
  document.body.classList.remove("sidebar-open");
  const reportMetadata = state.reports.find((report) => report.file === file);
  elements.currentDate.textContent = formatDate(reportMetadata?.date);
  elements.report.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span><p>正在读取周报</p></div>';
  const response = await fetch(`/api/reports/${encodeURIComponent(file)}`);
  if (!response.ok) throw new Error("无法读取这期周报");
  state.markdown = await response.text();
  elements.report.innerHTML = renderMarkdown(state.markdown);
  state.renderedText = elements.report.textContent;
  document.title = `${reportMetadata?.title || "研究归档"} · Research Scout`;
  buildToc();
  if (state.query) highlightQuery(state.query);
  scrollTo({ top: 0, behavior: "instant" });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("report-theme", theme);
  elements.themeButton.setAttribute("aria-label", theme === "dark" ? "切换到浅色" : "切换到深色");
}

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  renderArchiveList();
  loadReport(state.activeFile).catch(showError);
});
elements.allReportsTab.addEventListener("click", () => setArchiveView("all"));
elements.favoritesTab.addEventListener("click", () => setArchiveView("favorites"));
for (const tab of [elements.allReportsTab, elements.favoritesTab]) {
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const nextView = state.archiveView === "all" ? "favorites" : "all";
    setArchiveView(nextView);
    (nextView === "all" ? elements.allReportsTab : elements.favoritesTab).focus();
  });
}
elements.refreshButton.addEventListener("click", async () => {
  try {
    const active = await loadReports();
    await loadReport(active);
  } catch (error) { showError(error); }
});
elements.themeButton.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
elements.printButton.addEventListener("click", () => print());
elements.openSidebar.addEventListener("click", () => document.body.classList.add("sidebar-open"));
elements.closeSidebar.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
elements.scrim.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.searchInput) {
    event.preventDefault();
    elements.searchInput.focus();
  }
  if (event.key === "Escape") {
    document.body.classList.remove("sidebar-open");
    elements.searchInput.blur();
  }
});
addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  elements.progressBar.style.width = `${max > 0 ? Math.min(100, scrollY / max * 100) : 0}%`;
}, { passive: true });

function showError(error) {
  console.error(error);
  elements.report.innerHTML = `<div class="empty-state"><strong>读取失败</strong><p>${escapeHtml(error.message)}</p></div>`;
}

const storedTheme = localStorage.getItem("report-theme");
applyTheme(storedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

try {
  const active = await loadReports();
  await loadReport(active);
  setInterval(() => loadReports().catch(console.error), 30_000);
} catch (error) {
  showError(error);
}
