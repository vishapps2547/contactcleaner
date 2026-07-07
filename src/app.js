window.addEventListener('error', (e) => {
  alert('JS Error: ' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
  alert('Promise Error: ' + msg);
});

import { Contacts } from '@capacitor-community/contacts';

let allContacts = [];
let categorized = { duplicates: [], invalid: [], noname: [], unused: [] };
let duplicateGroups = [];
let currentCategory = null;
let selectedIds = new Set();

const scanBtn = document.getElementById('scanBtn');
const loading = document.getElementById('loading');
const summaryCards = document.getElementById('summaryCards');
const totalCount = document.getElementById('totalCount');

const homeScreen = document.getElementById('homeScreen');
const listScreen = document.getElementById('listScreen');
const backBtn = document.getElementById('backBtn');
const listTitle = document.getElementById('listTitle');
const contactList = document.getElementById('contactList');
const selectAllBtn = document.getElementById('selectAllBtn');
const actionBar = document.getElementById('actionBar');
const selectedCount = document.getElementById('selectedCount');
const deleteBtn = document.getElementById('deleteBtn');

function normalizeNumber(n) {
  return (n || '').replace(/\D/g, '').slice(-10);
}

function isValidNumber(n) {
  const clean = normalizeNumber(n);
  return clean.length === 10;
}

async function scanContacts() {
  loading.classList.remove('hidden');
  scanBtn.classList.add('hidden');

  try {
    const permission = await Contacts.requestPermissions();
    if (permission.contacts !== 'granted') {
      loading.textContent = 'Permission denied. Settings me jaake Contacts access allow karo.';
      return;
    }

    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
        emails: true,
        organization: false,
        birthday: false,
        note: false,
        postalAddresses: false,
        image: true,
      }
    });

    allContacts = result.contacts || [];
    totalCount.textContent = `${allContacts.length} contacts scanned`;

    categorize();
    renderSummary();

    loading.classList.add('hidden');
    summaryCards.classList.remove('hidden');
  } catch (err) {
    loading.textContent = 'Error: ' + err.message;
  }
}

function categorize() {
  categorized = { duplicates: [], invalid: [], noname: [], unused: [] };

  // Count occurrences of each normalized number
  const numberMap = {};
  allContacts.forEach(c => {
    (c.phones || []).forEach(p => {
      const clean = normalizeNumber(p.number);
      if (clean) {
        if (!numberMap[clean]) numberMap[clean] = [];
        numberMap[clean].push(c.contactId);
      }
    });
  });

  allContacts.forEach(c => {
    const displayName = (c.name && c.name.display) ? c.name.display.trim() : '';
    const phones = c.phones || [];
    const hasName = displayName.length > 0;
    const hasEmail = (c.emails || []).length > 0;
    const hasPhoto = !!c.image;

    const numsClean = phones.map(p => normalizeNumber(p.number));
    const isDup = numsClean.some(n => n && numberMap[n] && numberMap[n].length > 1);
    const hasInvalidNum = phones.length > 0 && phones.some(p => !isValidNumber(p.number));
    const hasNoNumber = phones.length === 0;

    if (isDup) categorized.duplicates.push(c);
    if (!hasName) categorized.noname.push(c);
    else if (hasInvalidNum || hasNoNumber) categorized.invalid.push(c);

    // Likely unused: no name AND no email AND no photo (bare minimum entry)
    if (!hasName && !hasEmail && !hasPhoto) {
      categorized.unused.push(c);
    }
  });

  buildDuplicateGroups(numberMap);
}

function buildDuplicateGroups(numberMap) {
  // Union-Find to group contacts that share any phone number
  const parent = {};
  function find(id) {
    if (!(id in parent)) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  allContacts.forEach(c => { find(c.contactId); });

  Object.values(numberMap).forEach(ids => {
    if (ids.length > 1) {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }
  });

  const groups = {};
  allContacts.forEach(c => {
    const root = find(c.contactId);
    if (!groups[root]) groups[root] = [];
    groups[root].push(c);
  });

  duplicateGroups = Object.values(groups).filter(g => g.length > 1);
}

function renderSummary() {
  document.getElementById('dupCount').textContent = `${categorized.duplicates.length} contacts`;
  document.getElementById('invalidCount').textContent = `${categorized.invalid.length} contacts`;
  document.getElementById('nonameCount').textContent = `${categorized.noname.length} contacts`;
  document.getElementById('unusedCount').textContent = `${categorized.unused.length} contacts`;
}

function openCategory(cat) {
  currentCategory = cat;
  selectedIds.clear();

  const titles = {
    duplicates: 'Duplicate Contacts',
    invalid: 'Invalid / Incomplete',
    noname: 'No Name Contacts',
    unused: 'Likely Unused'
  };
  listTitle.textContent = titles[cat];

  if (cat === 'duplicates') {
    selectAllBtn.classList.add('hidden');
  } else {
    selectAllBtn.classList.remove('hidden');
  }

  homeScreen.classList.add('hidden');
  listScreen.classList.remove('hidden');

  renderList();
}

function renderList() {
  if (currentCategory === 'duplicates') {
    renderDuplicateGroups();
    return;
  }

  const items = categorized[currentCategory] || [];
  contactList.innerHTML = '';
  actionBar.classList.remove('merge-mode');

  if (items.length === 0) {
    contactList.innerHTML = '<div class="empty-state">Koi contact nahi mila is category me 🎉</div>';
    actionBar.classList.add('hidden');
    return;
  }

  items.forEach(c => {
    const name = (c.name && c.name.display) ? c.name.display : '(No Name)';
    const nums = (c.phones || []).map(p => p.number).join(', ') || '(No Number)';

    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `
      <input type="checkbox" data-id="${c.contactId}">
      <div>
        <div class="contact-name">${name}</div>
        <div class="contact-nums">${nums}</div>
      </div>
    `;
    const checkbox = div.querySelector('input');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) selectedIds.add(c.contactId);
      else selectedIds.delete(c.contactId);
      updateActionBar();
    });
    contactList.appendChild(div);
  });

  updateActionBar();
}

function renderDuplicateGroups() {
  contactList.innerHTML = '';
  actionBar.classList.add('hidden');

  if (duplicateGroups.length === 0) {
    contactList.innerHTML = '<div class="empty-state">Koi duplicate nahi mila 🎉</div>';
    return;
  }

  duplicateGroups.forEach((group, idx) => {
    const div = document.createElement('div');
    div.className = 'group-card';

    const entriesHtml = group.map(c => {
      const name = (c.name && c.name.display) ? c.name.display : '(No Name)';
      const nums = (c.phones || []).map(p => p.number).join(', ') || '(No Number)';
      return `<div class="group-entry"><div class="contact-name">${name}</div><div class="contact-nums">${nums}</div></div>`;
    }).join('');

    div.innerHTML = `
      <div class="group-header">${group.length} entries — same number</div>
      ${entriesHtml}
      <button class="merge-btn" data-group="${idx}">Merge into one</button>
    `;

    div.querySelector('.merge-btn').addEventListener('click', () => mergeGroup(idx));
    contactList.appendChild(div);
  });

  const mergeAllWrap = document.createElement('div');
  mergeAllWrap.className = 'merge-all-wrap';
  mergeAllWrap.innerHTML = `<button id="mergeAllBtn" class="primary-btn">Merge All ${duplicateGroups.length} Groups</button>`;
  contactList.prepend(mergeAllWrap);
  document.getElementById('mergeAllBtn').addEventListener('click', mergeAllGroups);
}

function buildMergedContactInput(group) {
  // Pick best name: longest non-empty display name
  let bestName = '';
  group.forEach(c => {
    const dn = (c.name && c.name.display) ? c.name.display.trim() : '';
    if (dn.length > bestName.length) bestName = dn;
  });

  // Collect unique phone numbers (by normalized value, keep original format)
  const seenNums = new Set();
  const phones = [];
  group.forEach(c => {
    (c.phones || []).forEach(p => {
      const clean = normalizeNumber(p.number);
      const key = clean || p.number;
      if (key && !seenNums.has(key)) {
        seenNums.add(key);
        phones.push({ type: 'mobile', number: p.number, isPrimary: phones.length === 0 });
      }
    });
  });

  // Collect unique emails
  const seenEmails = new Set();
  const emails = [];
  group.forEach(c => {
    (c.emails || []).forEach(e => {
      const key = (e.address || '').toLowerCase();
      if (key && !seenEmails.has(key)) {
        seenEmails.add(key);
        emails.push({ type: 'home', address: e.address, isPrimary: emails.length === 0 });
      }
    });
  });

  return {
    name: bestName ? { given: bestName } : undefined,
    phones,
    emails
  };
}

async function mergeGroup(idx) {
  const group = duplicateGroups[idx];
  if (!group) return;

  const confirmed = confirm(`${group.length} contacts ko ek me merge karein? Purane entries delete ho jayenge.`);
  if (!confirmed) return;

  try {
    const contactInput = buildMergedContactInput(group);
    await Contacts.createContact({ contact: contactInput });

    for (const c of group) {
      await Contacts.deleteContact({ contactId: c.contactId });
    }

    const idsToRemove = new Set(group.map(c => c.contactId));
    allContacts = allContacts.filter(c => !idsToRemove.has(c.contactId));

    categorize();
    renderSummary();
    renderList();
    totalCount.textContent = `${allContacts.length} contacts scanned`;
  } catch (err) {
    alert('Merge error: ' + err.message);
  }
}

async function mergeAllGroups() {
  const confirmed = confirm(`${duplicateGroups.length} groups merge karni hai? Ye process thoda time lega, beech me app band mat karna.`);
  if (!confirmed) return;

  try {
    for (const group of duplicateGroups.slice()) {
      const contactInput = buildMergedContactInput(group);
      await Contacts.createContact({ contact: contactInput });
      for (const c of group) {
        await Contacts.deleteContact({ contactId: c.contactId });
      }
      const idsToRemove = new Set(group.map(c => c.contactId));
      allContacts = allContacts.filter(c => !idsToRemove.has(c.contactId));
    }

    categorize();
    renderSummary();
    renderList();
    totalCount.textContent = `${allContacts.length} contacts scanned`;
    alert('Sab groups merge ho gaye!');
  } catch (err) {
    alert('Merge error: ' + err.message);
  }
}

function updateActionBar() {
  if (selectedIds.size > 0) {
    actionBar.classList.remove('hidden');
    selectedCount.textContent = `${selectedIds.size} selected`;
  } else {
    actionBar.classList.add('hidden');
  }
}

async function deleteSelected() {
  if (selectedIds.size === 0) return;
  const confirmed = confirm(`${selectedIds.size} contacts delete karne hai? Ye undo nahi ho sakta.`);
  if (!confirmed) return;

  try {
    for (const id of selectedIds) {
      await Contacts.deleteContact({ contactId: id });
    }
    // Remove deleted from allContacts and re-categorize
    allContacts = allContacts.filter(c => !selectedIds.has(c.contactId));
    selectedIds.clear();
    categorize();
    renderSummary();
    renderList();
    totalCount.textContent = `${allContacts.length} contacts scanned`;
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

// Event bindings
scanBtn.addEventListener('click', scanContacts);

document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => openCategory(card.dataset.target));
});

backBtn.addEventListener('click', () => {
  listScreen.classList.add('hidden');
  homeScreen.classList.remove('hidden');
});

selectAllBtn.addEventListener('click', () => {
  const items = categorized[currentCategory] || [];
  const allSelected = selectedIds.size === items.length;
  if (allSelected) {
    selectedIds.clear();
  } else {
    items.forEach(c => selectedIds.add(c.contactId));
  }
  renderList();
  document.querySelectorAll('.contact-item input[type="checkbox"]').forEach(cb => {
    cb.checked = selectedIds.has(cb.dataset.id);
  });
});

deleteBtn.addEventListener('click', deleteSelected);
