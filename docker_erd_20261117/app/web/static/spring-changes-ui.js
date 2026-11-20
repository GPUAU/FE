let springChangesRevision = 0;

async function refreshSpringChanges(root) {
  const history = root.querySelector('#sgHistory');
  if (!history) return;
  const revision = ++springChangesRevision;
  const { model, term, provider, region, period } = SG;
  try {
    const { mountChanges } = await import('/static/spring-changes.mjs');
    if (revision !== springChangesRevision || !history.isConnected || state.view !== 'trend') return;
    mountChanges(history, { model, term, provider, region, period }, {
      request: api, escape: mh, historyRows: SG.data?.history || [],
    });
  } catch {
    if (revision !== springChangesRevision || !history.isConnected || state.view !== 'trend') return;
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = '가격·상태 변화 화면을 불러오지 못했습니다.';
    history.appendChild(message);
  }
}
