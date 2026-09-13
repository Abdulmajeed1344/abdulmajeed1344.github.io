// upload.js — GitHub API + Password Auth upload dashboard
// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const DASHBOARD_PASSWORD = 'Abdulmajeed02.';
const GITHUB_TOKEN       = atob('Z2hwX0UzZG9JZksxOXZtbVQ1TnZmaFo2RHpRM3NScmZFSjBYSzVpZw==');
const GITHUB_OWNER       = 'Abdulmajeed1344';
const GITHUB_REPO        = 'abdulmajeed1344.github.io';
const GITHUB_BRANCH      = 'main';
const DATA_PATH          = 'data.json'; // path within the repo

// ─── GITHUB API HELPERS ───────────────────────────────────────────────────────
const GH_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

function getGhHeaders() {
  const customToken = localStorage.getItem('gh_token');
  const token = customToken || GITHUB_TOKEN;
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

/** Fetch data.json from GitHub, return { data, sha } */
async function ghGetData() {
  const res = await fetch(`${GH_API}/${DATA_PATH}?ref=${GITHUB_BRANCH}`, { headers: getGhHeaders() });
  if (!res.ok) {
    if (res.status === 404) return { data: { albums: [] }, sha: null };
    if (res.status === 401) {
      throw new Error('401 Unauthorized — GitHub token invalid/expired. Please enter a valid Personal Access Token on the login screen.');
    }
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const json = await res.json();
  const rawStr = atob(json.content.replace(/\n/g, ''));
  const decodedStr = decodeURIComponent(escape(rawStr));
  const data = JSON.parse(decodedStr);
  return { data, sha: json.sha };
}

/** Write updated data.json back to GitHub */
async function ghPutData(data, sha) {
  const body = {
    message: 'chore: update data.json via dashboard',
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${GH_API}/${DATA_PATH}`, {
    method: 'PUT', headers: getGhHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('401 Unauthorized — GitHub token invalid/expired. Please update your token on the login screen.');
    }
    throw new Error(err.message || `GitHub write error: ${res.status}`);
  }
  return res.json();
}

/** Upload a single file to GitHub, return its raw URL */
async function ghUploadFile(albumId, fileName, base64Content) {
  const filePath = `media/${albumId}/${fileName}`;
  const body = {
    message: `upload: ${fileName}`,
    content: base64Content,
    branch: GITHUB_BRANCH
  };
  const res = await fetch(`${GH_API}/${filePath}`, {
    method: 'PUT', headers: getGhHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('401 Unauthorized — GitHub token invalid/expired.');
    }
    throw new Error(err.message || `Upload failed: ${res.status}`);
  }
  const json = await res.json();
  // Return the raw GitHub URL
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
}

/** Delete a file from GitHub */
async function ghDeleteFile(albumId, fileName) {
  const filePath = `media/${albumId}/${fileName}`;
  // First get the current SHA of the file
  const res = await fetch(`${GH_API}/${filePath}?ref=${GITHUB_BRANCH}`, { headers: getGhHeaders() });
  if (!res.ok) return; // file might already be gone
  const json = await res.json();
  await fetch(`${GH_API}/${filePath}`, {
    method: 'DELETE',
    headers: getGhHeaders(),
    body: JSON.stringify({
      message: `delete: ${fileName}`,
      sha: json.sha,
      branch: GITHUB_BRANCH
    })
  });
}

/** Read a File as base64 string (no data: prefix) */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Simple unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── DOM REFS ──────────────────────────────────────────────────────────────────
const loginScreen      = document.getElementById('login-screen');
const dashboard        = document.getElementById('dashboard');
const passwordInput    = document.getElementById('password-input');
const tokenInput       = document.getElementById('token-input');
const pwSubmit         = document.getElementById('pw-submit');
const pwError          = document.getElementById('pw-error');
const signOutBtn       = document.getElementById('sign-out-btn');

if (tokenInput && localStorage.getItem('gh_token')) {
  tokenInput.value = localStorage.getItem('gh_token');
}

const albumList        = document.getElementById('album-list');
const newAlbumBtn      = document.getElementById('new-album-btn');
const dashNoAlbum      = document.getElementById('dash-no-album');
const dashAlbumPanel   = document.getElementById('dash-album-panel');
const panelAlbumName   = document.getElementById('panel-album-name');
const panelAlbumMeta   = document.getElementById('panel-album-meta');
const renameAlbumBtn   = document.getElementById('rename-album-btn');
const deleteAlbumBtn   = document.getElementById('delete-album-btn');
const openUploadBtn    = document.getElementById('open-upload-btn');
const dashMediaGrid    = document.getElementById('dash-media-grid');
const dashMediaEmpty   = document.getElementById('dash-media-empty');

const uploadModal      = document.getElementById('upload-modal');
const modalClose       = document.getElementById('modal-close');
const cancelUpload     = document.getElementById('cancel-upload');
const startUpload      = document.getElementById('start-upload');
const dropZone         = document.getElementById('drop-zone');
const fileInput        = document.getElementById('file-input');
const previewList      = document.getElementById('preview-list');
const uploadCaption    = document.getElementById('upload-caption');

const newAlbumModal    = document.getElementById('new-album-modal');
const newAlbumClose    = document.getElementById('new-album-close');
const cancelNewAlbum   = document.getElementById('cancel-new-album');
const confirmNewAlbum  = document.getElementById('confirm-new-album');
const newAlbumName     = document.getElementById('new-album-name');

// ─── STATE ─────────────────────────────────────────────────────────────────────
let selectedAlbumId   = null;
let selectedAlbumName = '';
let pendingFiles      = [];

// ─── TOAST ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = (type === 'success' ? '✓ ' : '✕ ') + msg;
  el.className = `show toast-${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.classList.remove('show'); }, 3200);
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────
function checkAuth() {
  return sessionStorage.getItem('dash_auth') === '1';
}

function showDashboard() {
  if (loginScreen) {
    loginScreen.style.setProperty('display', 'none', 'important');
    loginScreen.style.setProperty('visibility', 'hidden', 'important');
    loginScreen.hidden = true;
  }
  if (dashboard) {
    dashboard.style.setProperty('display', 'flex', 'important');
    dashboard.style.setProperty('visibility', 'visible', 'important');
    dashboard.hidden = false;
  }
  loadAlbums().catch(err => {
    console.error('loadAlbums error:', err);
    toast('Error loading albums: ' + err.message, 'error');
  });
}

function showLogin() {
  if (dashboard) {
    dashboard.style.setProperty('display', 'none', 'important');
    dashboard.style.setProperty('visibility', 'hidden', 'important');
    dashboard.hidden = true;
  }
  if (loginScreen) {
    loginScreen.style.setProperty('display', 'flex', 'important');
    loginScreen.style.setProperty('visibility', 'visible', 'important');
    loginScreen.hidden = false;
  }
  if (passwordInput) passwordInput.value = '';
  if (pwError) pwError.style.display = 'none';
}

// Check if already authenticated in this session
if (checkAuth()) { showDashboard(); }

function doLogin() {
  const raw = (passwordInput.value || '').trim();
  const lower = raw.toLowerCase();
  const validPasswords = ['abdulmajeed02.', 'abdulmajeed02', 'abdulmajeed', 'abdulmajeed02!'];
  if (validPasswords.includes(lower)) {
    sessionStorage.setItem('dash_auth', '1');
    if (tokenInput && tokenInput.value.trim()) {
      localStorage.setItem('gh_token', tokenInput.value.trim());
    }
    if (pwError) pwError.style.display = 'none';
    showDashboard();
  } else {
    if (pwError) pwError.style.display = 'block';
    passwordInput.value = '';
    passwordInput.focus();
    passwordInput.style.borderColor = 'rgba(220,80,80,0.6)';
    setTimeout(() => { if (passwordInput) passwordInput.style.borderColor = ''; }, 1500);
  }
}

pwSubmit.addEventListener('click', (e) => {
  e.preventDefault();
  doLogin();
});

passwordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doLogin();
  }
});

signOutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('dash_auth');
  showLogin();
});

// ─── LOAD ALBUMS ───────────────────────────────────────────────────────────────
async function loadAlbums() {
  albumList.innerHTML = '<li class="album-list-loading">Loading…</li>';
  try {
    const { data } = await ghGetData();
    albumList.innerHTML = '';

    if (!data.albums || data.albums.length === 0) {
      albumList.innerHTML = '<li class="album-list-loading">No albums yet.</li>';
      return;
    }

    data.albums.forEach(album => {
      albumList.appendChild(buildAlbumListItem(album.id, album.name, album.itemCount || 0));
    });

    // Re-select if one was previously selected
    if (selectedAlbumId) {
      const album = data.albums.find(a => a.id === selectedAlbumId);
      if (album) openAlbum(album.id, album.name);
    }
  } catch (err) {
    albumList.innerHTML = `<li class="album-list-loading">Error: ${err.message}</li>`;
  }
}

function buildAlbumListItem(id, name, count) {
  const li = document.createElement('li');
  li.className = 'album-list-item' + (id === selectedAlbumId ? ' active' : '');
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `Select album: ${name}`);
  li.dataset.id = id;
  li.innerHTML = `
    <span class="album-list-name">${escHtml(name)}</span>
    <span class="album-list-count">${count}</span>`;
  li.addEventListener('click', () => openAlbum(id, name));
  li.addEventListener('keydown', e => { if (e.key === 'Enter') openAlbum(id, name); });
  return li;
}

// ─── OPEN ALBUM ────────────────────────────────────────────────────────────────
async function openAlbum(id, name) {
  selectedAlbumId   = id;
  selectedAlbumName = name;

  document.querySelectorAll('.album-list-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));

  panelAlbumName.textContent = name;
  panelAlbumMeta.textContent = 'Loading media…';
  dashMediaGrid.innerHTML    = '';
  dashMediaEmpty.hidden      = true;
  dashNoAlbum.hidden         = true;
  dashAlbumPanel.hidden      = false;

  try {
    const { data } = await ghGetData();
    const album = data.albums.find(a => a.id === id);
    if (!album) { panelAlbumMeta.textContent = 'Album not found.'; return; }

    const media = album.media || [];
    const count = media.length;
    panelAlbumMeta.textContent = `${count} item${count !== 1 ? 's' : ''}`;

    if (count === 0) { dashMediaEmpty.hidden = false; return; }

    media.slice().reverse().forEach(m => {
      dashMediaGrid.appendChild(buildDashMediaItem(m));
    });
  } catch (err) {
    panelAlbumMeta.textContent = 'Error loading media.';
    toast(err.message, 'error');
  }
}

// ─── BUILD DASHBOARD MEDIA ITEM ────────────────────────────────────────────────
function buildDashMediaItem(m) {
  const li = document.createElement('li');
  li.className = 'dash-media-item';
  li.dataset.id = m.id;

  const isVideo = m.type === 'video';
  li.innerHTML = `
    ${isVideo
      ? `<video class="dash-media-thumb-video" src="${m.url}" preload="metadata" muted></video>`
      : `<img class="dash-media-thumb" src="${m.url}" alt="${escHtml(m.caption || 'Media')}" loading="lazy" />`}
    <div class="dash-media-info">
      <label class="caption-label" style="font-size:0.7rem;margin:0;color:var(--muted);">📝 Notes / Caption</label>
      <textarea class="dash-media-caption-input" rows="2" placeholder="Add notes or caption…" maxlength="300" aria-label="Notes for this item">${escHtml(m.caption || '')}</textarea>
      <div class="dash-media-actions">
        <button class="btn-caption-save" aria-label="Save notes">Save Note</button>
        <button class="btn-media-delete" aria-label="Delete this item">Delete</button>
      </div>
    </div>`;

  // Save caption / notes
  li.querySelector('.btn-caption-save').addEventListener('click', async () => {
    const cap = li.querySelector('.dash-media-caption-input').value.trim();
    try {
      const { data, sha } = await ghGetData();
      const album = data.albums.find(a => a.id === selectedAlbumId);
      if (album) {
        const item = (album.media || []).find(x => x.id === m.id);
        if (item) item.caption = cap;
        await ghPutData(data, sha);
        toast('Caption saved');
      }
    } catch (err) { toast(err.message, 'error'); }
  });

  // Delete media
  li.querySelector('.btn-media-delete').addEventListener('click', async () => {
    if (!confirm(`Delete this ${m.type || 'item'}? This cannot be undone.`)) return;
    try {
      // Delete file from GitHub
      await ghDeleteFile(selectedAlbumId, m.fileName).catch(() => {});
      // Update data.json
      const { data, sha } = await ghGetData();
      const album = data.albums.find(a => a.id === selectedAlbumId);
      if (album) {
        album.media    = (album.media || []).filter(x => x.id !== m.id);
        album.itemCount = album.media.length;
        if (album.coverImage === m.url) {
          album.coverImage = album.media[0]?.url || '';
        }
        await ghPutData(data, sha);
      }
      li.remove();
      toast('Item deleted');
      const remaining = dashMediaGrid.children.length;
      panelAlbumMeta.textContent = `${remaining} item${remaining !== 1 ? 's' : ''}`;
      if (remaining === 0) dashMediaEmpty.hidden = false;
    } catch (err) { toast(err.message, 'error'); }
  });

  return li;
}

// ─── RENAME ALBUM ──────────────────────────────────────────────────────────────
renameAlbumBtn.addEventListener('click', async () => {
  const newName = prompt('New album name:', selectedAlbumName);
  if (!newName || newName.trim() === selectedAlbumName) return;
  try {
    const { data, sha } = await ghGetData();
    const album = data.albums.find(a => a.id === selectedAlbumId);
    if (album) {
      album.name = newName.trim();
      await ghPutData(data, sha);
      selectedAlbumName = newName.trim();
      panelAlbumName.textContent = selectedAlbumName;
      toast('Album renamed');
      loadAlbums();
    }
  } catch (err) { toast(err.message, 'error'); }
});

// ─── DELETE ALBUM ──────────────────────────────────────────────────────────────
deleteAlbumBtn.addEventListener('click', async () => {
  if (!confirm(`Delete album "${selectedAlbumName}" and ALL its media? This cannot be undone.`)) return;
  try {
    const { data, sha } = await ghGetData();
    const album = data.albums.find(a => a.id === selectedAlbumId);
    if (album) {
      // Delete all media files from GitHub (best-effort)
      await Promise.allSettled((album.media || []).map(m =>
        ghDeleteFile(selectedAlbumId, m.fileName)
      ));
      data.albums = data.albums.filter(a => a.id !== selectedAlbumId);
      await ghPutData(data, sha);
    }
    selectedAlbumId   = null;
    dashAlbumPanel.hidden = true;
    dashNoAlbum.hidden    = false;
    toast('Album deleted');
    loadAlbums();
  } catch (err) { toast(err.message, 'error'); }
});

// ─── NEW ALBUM MODAL ───────────────────────────────────────────────────────────
newAlbumBtn.addEventListener('click',    () => { newAlbumName.value = ''; newAlbumModal.hidden = false; newAlbumName.focus(); });
newAlbumClose.addEventListener('click',  () => { newAlbumModal.hidden = true; });
cancelNewAlbum.addEventListener('click', () => { newAlbumModal.hidden = true; });

confirmNewAlbum.addEventListener('click', async () => {
  const name = newAlbumName.value.trim();
  const descEl = document.getElementById('new-album-desc');
  const description = descEl ? descEl.value.trim() : '';
  if (!name) { toast('Please enter an album name', 'error'); return; }
  try {
    const { data, sha } = await ghGetData();
    const newAlbum = {
      id: uid(),
      name,
      description,
      createdAt: Date.now(),
      coverImage: '',
      itemCount: 0,
      media: []
    };
    data.albums.unshift(newAlbum);
    await ghPutData(data, sha);
    newAlbumModal.hidden = true;
    if (descEl) descEl.value = '';
    toast(`Album "${name}" created`);
    loadAlbums();
  } catch (err) { toast(err.message, 'error'); }
});

newAlbumName.addEventListener('keydown', e => { if (e.key === 'Enter') confirmNewAlbum.click(); });

// ─── UPLOAD MODAL ─────────────────────────────────────────────────────────────
openUploadBtn.addEventListener('click', () => {
  pendingFiles      = [];
  previewList.innerHTML = '';
  previewList.hidden    = true;
  uploadCaption.value   = '';
  startUpload.disabled  = true;
  uploadModal.hidden    = false;
});

const closeUploadModal = () => { uploadModal.hidden = true; pendingFiles = []; };
modalClose.addEventListener('click',   closeUploadModal);
cancelUpload.addEventListener('click', closeUploadModal);

// Drop zone events
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles([...e.dataTransfer.files]);
});
fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

function handleFiles(files) {
  const allowed = ['image/jpeg','image/png','image/gif','video/mp4','video/quicktime','video/webm'];
  const valid   = files.filter(f => allowed.includes(f.type));
  if (valid.length !== files.length) toast(`${files.length - valid.length} unsupported file(s) skipped`, 'error');
  if (!valid.length) return;

  pendingFiles = [...pendingFiles, ...valid];
  renderPreviews();
  startUpload.disabled = false;
}

function renderPreviews() {
  previewList.hidden = false;
  previewList.innerHTML = '';
  pendingFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.id = `preview-${i}`;
    item.setAttribute('role', 'listitem');

    const isVideo = file.type.startsWith('video/');
    const thumb = isVideo
      ? `<div class="preview-thumb-video" aria-hidden="true">🎬</div>`
      : `<img class="preview-thumb" src="${URL.createObjectURL(file)}" alt="${escHtml(file.name)}" />`;

    item.innerHTML = `
      ${thumb}
      <div class="preview-info">
        <p class="preview-name">${escHtml(file.name)}</p>
        <p class="preview-size">${formatBytes(file.size)}</p>
        <div class="preview-progress"><div class="preview-progress-bar" id="bar-${i}"></div></div>
      </div>
      <span class="preview-status preview-status--pending" id="status-${i}">Pending</span>`;
    previewList.appendChild(item);
  });
}

// ─── UPLOAD FILES ──────────────────────────────────────────────────────────────
startUpload.addEventListener('click', async () => {
  if (!selectedAlbumId || !pendingFiles.length) return;
  startUpload.disabled  = true;
  cancelUpload.disabled = true;
  modalClose.disabled   = true;
  const caption = uploadCaption.value.trim();

  let successCount = 0;

  // Load current data once
  let { data, sha } = await ghGetData().catch(err => { toast(err.message, 'error'); return {}; });
  if (!data) { cancelUpload.disabled = false; modalClose.disabled = false; return; }

  const album = data.albums.find(a => a.id === selectedAlbumId);
  if (!album) { toast('Album not found', 'error'); cancelUpload.disabled = false; modalClose.disabled = false; return; }

  for (let i = 0; i < pendingFiles.length; i++) {
    const file   = pendingFiles[i];
    const bar    = document.getElementById(`bar-${i}`);
    const status = document.getElementById(`status-${i}`);

    try {
      if (status) { status.textContent = 'Reading…'; status.className = 'preview-status preview-status--pending'; }
      if (bar) bar.style.width = '20%';

      const base64 = await fileToBase64(file);
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

      if (status) status.textContent = 'Uploading…';
      if (bar) bar.style.width = '50%';

      const url = await ghUploadFile(selectedAlbumId, fileName, base64);

      // Update local data object
      const mediaItem = {
        id: uid(),
        fileName,
        url,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        caption,
        uploadedAt: Date.now()
      };
      album.media = album.media || [];
      album.media.push(mediaItem);
      if (!album.coverImage) album.coverImage = url;

      successCount++;
      if (bar) bar.style.width = '100%';
      if (status) { status.textContent = 'Done ✓'; status.className = 'preview-status preview-status--done'; }
    } catch (err) {
      if (status) { status.textContent = 'Error'; status.className = 'preview-status preview-status--error'; }
      console.error('Upload error for', file.name, err);
    }
  }

  // Write updated data.json once at the end
  try {
    album.itemCount = (album.media || []).length;
    // Refresh sha before writing (sha may have changed if GitHub committed something)
    const refreshed = await ghGetData();
    sha = refreshed.sha;
    // Merge our album changes into fresh data
    const freshAlbum = refreshed.data.albums.find(a => a.id === selectedAlbumId);
    if (freshAlbum) {
      freshAlbum.media      = album.media;
      freshAlbum.itemCount  = album.itemCount;
      freshAlbum.coverImage = album.coverImage;
      await ghPutData(refreshed.data, sha);
    } else {
      await ghPutData(data, sha);
    }
  } catch (err) {
    toast('Metadata save failed: ' + err.message, 'error');
  }

  toast(`${successCount} file${successCount !== 1 ? 's' : ''} uploaded`);
  cancelUpload.disabled = false;
  modalClose.disabled   = false;

  setTimeout(() => {
    closeUploadModal();
    openAlbum(selectedAlbumId, selectedAlbumName);
    loadAlbums();
  }, 900);
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
