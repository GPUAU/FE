/* Region labels affect presentation only. Option values remain the provider codes. */
(() => {
  const labels = {
    'ap-northeast-2':'서울', 'ap-south-2':'하이데라바드', 'eu-west-2':'런던',
    'sa-east-1':'상파울루', 'us-east-1':'버지니아 북부', 'us-west-2':'오리건',
    'us-gov-east-1':'GovCloud 동부', 'FIN-01':'헬싱키', 'FIN-02':'헬싱키', 'FIN-03':'헬싱키',
    'fr-par-2':'파리', 'pl-waw-2':'바르샤바', 'CANADA-1':'퀘벡', 'CANADA-2':'캐나다', 'NORWAY-1':'베스트란', 'us-central1':'캔자스시티', 'us-north1':'우드버리', 'eu-south1':'마드리드', 'US-1':'텍사스',
    australiaeast:'호주 동부', australiasoutheast:'호주 남동부', brazilsouth:'브라질 남부',
    canadacentral:'캐나다 중부', canadaeast:'캐나다 동부', centralus:'미국 중부', eastus:'미국 동부', eastus2:'미국 동부 2',
    germanywestcentral:'독일 중서부', indonesiacentral:'인도네시아 중부', italynorth:'이탈리아 북부',
    japaneast:'일본 동부', japanwest:'일본 서부', koreacentral:'서울', koreasouth:'부산',
    northcentralus:'미국 중북부', polandcentral:'폴란드 중부', southafricanorth:'남아공 북부', southafricawest:'남아공 서부',
    southcentralus:'미국 중남부', southindia:'인도 남부', spaincentral:'스페인 중부', swedencentral:'스웨덴 중부',
    switzerlandnorth:'스위스 북부', uaecentral:'UAE 중부', uaenorth:'UAE 북부', uksouth:'영국 남부',
    usgovarizona:'미국 정부용 애리조나', westcentralus:'미국 중서부', westeurope:'서유럽',
    westus:'미국 서부', westus2:'미국 서부 2', westus3:'미국 서부 3'
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const countryName = code => {
    if (!code || !/^[A-Z]{2}$/.test(code)) return '';
    return new Intl.DisplayNames(['ko'], {type:'region'}).of(code);
  };
  window.RegionDisplay = {
    name: code => labels[code] || '',
    cell(country, code) {
      const place = labels[code];
      const name = countryName(country);
      return `<b>${escape([name, place].filter((value, index, array) => value && array.indexOf(value) === index).join(' · ') || '지역 미확인')}</b><span>${escape(code || '미확인')}</span>`;
    }
  };
  let nextId = 0;
  function enhance(select) {
    if (select.dataset.regionEnhanced) return;
    select.dataset.regionEnhanced = 'true';
    const isRegion = select.id === 'mfRegion' || select.id === 'cpRegion';
    const controlLabel = isRegion ? '서비스 지역' : select.id === 'mfModel' ? 'GPU 모델' : '사업자';
    const wrapper = document.createElement('div');
    wrapper.className = 'region-picker';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select);
    const label = select.closest('label');
    const labelText = label?.querySelector('span');
    if (labelText?.textContent === '리전') labelText.textContent = '서비스 지역';
    for (const node of label?.childNodes || []) if (node.nodeType === 3 && node.textContent.trim() === '리전') node.textContent = '서비스 지역';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'region-trigger';
    button.id = select.id + '-trigger';
    button.setAttribute('aria-label', controlLabel);
    if (label?.htmlFor === select.id) label.htmlFor = button.id;
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div');
    list.id = 'region-options-' + nextId++;
    list.className = 'region-options'; list.role = 'listbox'; list.hidden = true;
    list.setAttribute('aria-label', controlLabel);
    button.setAttribute('aria-controls', list.id);
    select.classList.add('region-native'); select.tabIndex = -1; select.setAttribute('aria-hidden','true');
    wrapper.append(button, list);
    const close = () => {list.hidden = true; button.setAttribute('aria-expanded','false');};
    const contents = option => {
      if (!option) return '';
      if (!isRegion) return `<span class="region-place">${escape(option.textContent)}</span>`;
      const isAll = !option.value || option.value === 'ALL';
      return `<span class="region-place">${escape(isAll ? '전체 지역' : labels[option.value] || option.textContent)}</span>${isAll || !labels[option.value] ? '' : `<span class="region-code">${escape(option.value)}</span>`}`;
    };
    const sync = () => {
      button.disabled = select.disabled;
      button.innerHTML = contents(select.selectedOptions[0] || select.options[0]);
      list.replaceChildren();
      Array.from(select.options).forEach(option => {
        const row = document.createElement('button'); row.type = 'button'; row.role = 'option'; row.className = 'region-option'; row.tabIndex = -1;
        row.setAttribute('aria-selected', String(option.selected)); row.innerHTML = contents(option); row.disabled = option.disabled;
        // Keep pointer focus inside the menu until click commits the selection (including Safari).
        row.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' && event.button === 0) event.preventDefault(); });
        row.onclick = event => {
          event.preventDefault(); event.stopPropagation();
          select.value = option.value; close();
          select.dispatchEvent(new Event('change', {bubbles:true}));
          // Changing the simulation scope rebuilds its controls. Restore focus to the new trigger.
          queueMicrotask(() => document.getElementById(button.id)?.focus({preventScroll:true}));
        };
        list.append(row);
      });
    };
    button.onclick = event => {event.preventDefault(); event.stopPropagation(); const open = list.hidden; list.hidden = !open; button.setAttribute('aria-expanded', String(open)); if(open) list.querySelector('[aria-selected="true"]')?.focus();};
    wrapper.addEventListener('keydown', event => {
      if (event.key === 'Escape') {event.preventDefault();close();button.focus();}
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      event.preventDefault(); list.hidden = false; button.setAttribute('aria-expanded','true');
      const rows = Array.from(list.querySelectorAll('button:not(:disabled)'));
      const at = rows.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length-1 : at < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length-1) : (at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[index]?.focus();
    });
    wrapper.addEventListener('focusout', () => queueMicrotask(() => { if(!wrapper.contains(document.activeElement)) close(); }));
    select.addEventListener('change',sync);
    new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    sync();
  }
  const scan = () => document.querySelectorAll('select#mfModel,select#mfProvider,select#mfRegion,select#cpRegion').forEach(enhance);
  new MutationObserver(scan).observe(document.body, {childList:true,subtree:true}); scan();
})();
