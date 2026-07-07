import { Contacts } from '@capacitor-community/contacts';

let allContacts = [];
let categorized = { duplicates: [], invalid: [], noname: [], unused: [] };
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

  homeScreen.classList.add('hidden');
  listScreen.classList.remove('hidden');

  renderList();
}

function renderList() {
  const items = categorized[currentCategory] || [];
  contactList.innerHTML = '';

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
