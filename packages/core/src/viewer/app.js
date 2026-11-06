const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (cls) el.className = cls;
  return el;
};
const badge = (text) =>
  node('span', text, `badge ${String(text).toLowerCase()}`);
const pretty = (value) => node('pre', JSON.stringify(value, null, 2), 'data');
const date = (value) => new Date(value).toLocaleString();
let runs = [],
  selected = '',
  selection = 0,
  refresh = 0;
async function request(path) {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(10000),
    credentials: 'omit',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request unavailable');
  return data;
}
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}
function details(label, value) {
  const el = node('details');
  el.append(node('summary', label), pretty(value));
  return el;
}
function panel(title) {
  const el = node('article', undefined, 'panel');
  el.append(node('h3', title));
  return el;
}
function keyValues(values) {
  const dl = node('dl', undefined, 'kv');
  for (const [key, value] of Object.entries(values))
    dl.append(node('dt', key), node('dd', value));
  return dl;
}
function renderRuns() {
  const search = $('search').value.toLowerCase().trim(),
    verdict = $('verdict').value,
    source = $('source').value;
  const filtered = runs.filter(
    (r) =>
      (!verdict || r.result === verdict) &&
      (!source || r.source === source) &&
      `${r.title} ${r.scenarioId} ${r.runId}`.toLowerCase().includes(search),
  );
  $('run-count').textContent =
    `${filtered.length} of ${runs.length} runs ? Reviewed examples are historical captures, not new executions.`;
  const target = $('run-list');
  target.replaceChildren();
  if (!filtered.length) {
    target.append(
      node(
        'div',
        'No matching runs. Change the filters or create a run with the CLI.',
        'empty',
      ),
    );
    return;
  }
  for (const run of filtered) {
    const button = node(
      'button',
      undefined,
      `run-row${selected === run.key ? ' selected' : ''}`,
    );
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selected === run.key));
    const left = node('span');
    left.append(node('span', run.title, 'run-name'));
    const meta = node('span', undefined, 'run-meta');
    for (const text of [
      run.source,
      run.runId.slice(0, 8),
      date(run.startedAt),
      `${run.steps} actions`,
      run.complete
        ? 'Recorded journal complete'
        : 'Journal incomplete / absent',
    ])
      meta.append(node('span', text));
    left.append(meta);
    const right = node('span', undefined, 'run-right');
    right.append(badge(run.result), node('span', '?', 'run-arrow'));
    button.append(left, right);
    button.addEventListener('click', () => selectRun(run.key, true));
    target.append(button);
  }
}
async function loadRuns() {
  const ticket = ++refresh;
  $('refresh').disabled = true;
  notice('');
  try {
    const data = await request('/api/runs');
    if (ticket !== refresh) return;
    runs = data.runs;
    $('stat-total').textContent = String(runs.length);
    $('stat-pass').textContent = String(
      runs.filter((r) => r.result === 'PASS').length,
    );
    $('stat-fail').textContent = String(
      runs.filter((r) => r.result === 'FAIL').length,
    );
    $('stat-evidence').textContent = String(
      runs.filter((r) => r.complete).length,
    );
    if (data.unavailable || data.limited)
      notice(
        `${data.unavailable} reports/examples unavailable.${data.limited ? ' Local listing is limited to 100 report files.' : ''}`,
      );
    for (const id of ['compare-left', 'compare-right']) {
      const select = $(id),
        previous = select.value;
      select.replaceChildren(
        node(
          'option',
          id === 'compare-left' ? 'Choose baseline?' : 'Choose rerun?',
        ),
      );
      select.firstChild.value = '';
      for (const run of runs) {
        const option = node(
          'option',
          `${run.scenarioId} ? ${run.result} ? ${run.runId.slice(0, 8)} ? ${run.source}`,
        );
        option.value = run.key;
        select.append(option);
      }
      if (runs.some((r) => r.key === previous)) select.value = previous;
    }
    renderRuns();
    if (selected && runs.some((r) => r.key === selected))
      await selectRun(selected, false);
    else if (runs.length) await selectRun(runs[0].key, false);
  } catch (error) {
    notice(`Could not load runs: ${error.message}`);
  } finally {
    if (ticket === refresh) $('refresh').disabled = false;
  }
}
async function selectRun(key, scroll) {
  selected = key;
  const ticket = ++selection;
  renderRuns();
  const content = $('detail-content');
  content.replaceChildren(node('div', 'Loading report?', 'empty'));
  try {
    const data = await request(`/api/run?key=${encodeURIComponent(key)}`);
    if (ticket !== selection) return;
    renderDetail(data.report, data.checks, key);
    if (scroll)
      $('details').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  } catch (error) {
    if (ticket === selection)
      content.replaceChildren(node('div', error.message, 'empty'));
  }
}
function renderDetail(report, checks, key) {
  const content = $('detail-content');
  content.replaceChildren();
  const intro = panel(''),
    heading = node('div', undefined, 'detail-heading'),
    text = node('div');
  intro.firstChild.remove();
  text.append(
    node('h3', report.definition.title),
    node(
      'div',
      `${key.startsWith('sample:') ? 'Reviewed example' : 'Saved local run'} ? ${report.runId}`,
      'context-line',
    ),
    node(
      'div',
      `${date(report.startedAt)} ? ${report.environment.fixtureMode || 'Unknown fixture'} ? ${report.endpointClass}`,
      'context-line',
    ),
  );
  heading.append(text, badge(report.result));
  intro.append(heading);
  const actions = node('div', undefined, 'detail-actions');
  for (const [label, format] of [
    ['Report JSON', 'report'],
    ['Evidence JSON', 'evidence'],
  ]) {
    if (format === 'evidence' && !report.evidence) continue;
    const link = node('a', `${label} ?`);
    link.href = `/api/download?key=${encodeURIComponent(key)}&format=${format}`;
    actions.append(link);
  }
  intro.append(
    actions,
    node(
      'p',
      'Admission, active state and execution success are separate observations. A matching offline check does not clear a recorded failure.',
    ),
  );
  content.append(intro);
  const grid = node('div', undefined, 'detail-grid');
  const timeline = panel('Action timeline');
  report.steps.forEach((step, index) => {
    const el = node('details'),
      summary = node('summary');
    summary.append(
      node('span', String(index + 1).padStart(2, '0'), 'step-index'),
      node('span', step.id.replaceAll('-', ' '), 'step-title'),
      badge(step.result),
    );
    el.append(summary, node('p', date(step.at)), pretty(step.observed));
    timeline.append(el);
  });
  const evidence = panel('Selected output checks');
  evidence.append(
    badge(checks.status),
    node(
      'p',
      `${checks.checks.length} selected checks ? ${checks.notReevaluatedSteps.length} actions not fully reevaluated. Original scenario: ${checks.recordedRunResult}.`,
    ),
  );
  evidence.append(
    node(
      'p',
      'CONSISTENT means selected saved outputs match recorded responses. It is not a new live PASS or independent verification.',
    ),
  );
  for (const check of checks.checks) {
    const row = node('div', undefined, 'check'),
      label = node('div', check.stepId.replaceAll('-', ' '), 'check-label');
    label.append(
      node(
        'small',
        `${check.check} ? RPC sequences ${check.rpcSequences.join(', ') || 'unavailable'}`,
      ),
    );
    row.append(label, badge(check.status));
    evidence.append(row);
  }
  evidence.append(
    details('Unreevaluated actions', checks.notReevaluatedSteps),
    details('Coverage limitations', checks.limitations),
    details('Saved-context requirements', checks.requirements),
  );
  grid.append(timeline, evidence);
  const journal = panel('Recorded RPC evidence');
  journal.classList.add('full-width');
  if (!report.evidence)
    journal.append(
      node(
        'p',
        'This historical report has no projected RPC journal. Evidence is unavailable, not inferred.',
      ),
    );
  else {
    const e = report.evidence;
    journal.append(
      keyValues({
        Recording: e.complete
          ? 'Complete filtered journal'
          : 'Incomplete recording',
        'Recorded entries': e.entries.length,
        'Omitted entries': e.omitted,
        'Unavailable reads': e.unavailable,
        Format: e.format,
      }),
      node(
        'p',
        'Filtered projections omit signing payloads, secrets and arbitrary server text. Recovered startup failures remain visible.',
      ),
    );
    const tools = node('div', undefined, 'journal-tools'),
      select = node('select');
    select.setAttribute('aria-label', 'Filter RPC evidence');
    for (const [value, label] of [
      ['all', 'All observations'],
      ['errors', 'Errors / unavailable'],
      ['results', 'Responses'],
    ]) {
      const option = node('option', label);
      option.value = value;
      select.append(option);
    }
    tools.append(node('span', 'Inspect individual responses', 'muted'), select);
    const rows = node('div', undefined, 'journal');
    const render = () => {
      rows.replaceChildren();
      const filtered = e.entries.filter(
        (entry) =>
          select.value === 'all' ||
          (select.value === 'errors'
            ? entry.outcome !== 'RESULT'
            : entry.outcome === 'RESULT'),
      );
      if (!filtered.length)
        rows.append(node('p', 'No observations match this filter.'));
      for (const entry of filtered) {
        const item = node('details'),
          summary = node('summary');
        summary.append(
          node('span', String(entry.seq), 'step-index'),
          node('span', entry.method, 'journal-method'),
          badge(entry.outcome),
        );
        item.append(summary, pretty(entry));
        rows.append(item);
      }
    };
    select.addEventListener('change', render);
    render();
    journal.append(tools, rows);
  }
  const context = panel('Source, environment & limits');
  context.classList.add('full-width');
  context.append(
    node('p', report.definition.expectedInvariant),
    details('Source pins', report.sourcePins),
    details('Observed environment', report.environment),
    details('Run limitations', report.limitations),
    details('Reproducer (display only)', report.reproducer),
  );
  grid.append(journal, context);
  content.append(grid);
}
$('compare-button').addEventListener('click', async () => {
  const left = $('compare-left').value,
    right = $('compare-right').value,
    target = $('compare-result');
  if (!left || !right) {
    target.replaceChildren(
      node('p', 'Choose a baseline and a rerun first.', 'error-text'),
    );
    return;
  }
  $('compare-button').disabled = true;
  target.replaceChildren(node('p', 'Comparing saved runs?', 'muted'));
  try {
    const result = await request(
      `/api/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`,
    );
    const card = node('div', undefined, 'comparison-card');
    card.append(
      node('h3', result.comparison.replaceAll('_', ' ')),
      node(
        'p',
        result.bothRunsPassed
          ? 'Both saved runs passed and their stable environment fields match.'
          : 'Matching outcomes do not imply a passing scenario. Review each recorded verdict.',
        'muted',
      ),
      keyValues({
        'Baseline verdict': result.baselineResult,
        'Rerun verdict': result.rerunResult,
        'Exact historical replay': 'No ? fresh-state comparison',
        'Environment differences':
          result.environmentDifferences.join(', ') || 'None in compared fields',
      }),
    );
    const header = node('div', undefined, 'comparison-row');
    header.append(
      node('strong', 'Action'),
      node('strong', 'Baseline'),
      node('strong', 'Rerun'),
    );
    card.append(header);
    for (const action of result.actions) {
      const row = node('div', undefined, 'comparison-row');
      row.append(
        node('span', action.id.replaceAll('-', ' ')),
        badge(action.baseline),
        badge(action.rerun),
      );
      card.append(row);
    }
    target.replaceChildren(card);
  } catch (error) {
    target.replaceChildren(node('p', error.message, 'error-text'));
  } finally {
    $('compare-button').disabled = false;
  }
});
$('refresh').addEventListener('click', loadRuns);
for (const id of ['search', 'verdict', 'source'])
  $(id).addEventListener(id === 'search' ? 'input' : 'change', renderRuns);
loadRuns();
