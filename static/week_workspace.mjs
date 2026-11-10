const days = document.querySelector('#weekDays');
const nav = document.querySelector('#weekDayNav');
const results = document.querySelector('#results');
function syncDays() {
  const fragment = document.createDocumentFragment();
  for (const [index, row] of [...days.children].entries()) {
    const heading = row.querySelector('h3');
    const date = row.querySelector('time');
    const count = row.querySelectorAll('.scheduled-pick').length;
    row.id = 'week-day-' + index;
    heading.tabIndex = -1;
    const link = document.createElement('a');
    link.href = '#' + row.id;
    link.dataset.dayTarget = row.id;
    const label = document.createElement('span');
    label.textContent = row.dataset.day.slice(0, 3);
    const detail = document.createElement('small');
    detail.textContent = count ? count + (count === 1 ? ' pick' : ' picks') : 'Open';
    link.setAttribute('aria-label', row.dataset.day + ', ' + date.textContent + ', ' + (count ? detail.textContent : 'no picks scheduled'));
    link.append(label, detail);
    fragment.append(link);
  }
  nav.replaceChildren(fragment);
}
nav.addEventListener('click', event => {
  const link = event.target.closest('[data-day-target]');
  if (!link) return;
  const row = document.getElementById(link.dataset.dayTarget);
  if (!row) return;
  event.preventDefault();
  row.querySelector('h3').focus({preventScroll: true});
  row.scrollIntoView({block: 'start'});
});
new MutationObserver(syncDays).observe(days, {childList: true});
new MutationObserver(() => {
  if (!results.hidden) {
    document.querySelector('#weekTitle').focus({preventScroll: true});
    results.scrollIntoView({block: 'start'});
  }
}).observe(results, {attributes: true, attributeFilter: ['hidden']});
syncDays();
