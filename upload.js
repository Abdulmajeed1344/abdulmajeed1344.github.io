// upload.js — Firebase Auth + Firestore + Storage upload dashboard
import { auth, db, storage, provider, AUTHORISED_EMAIL } from './firebase-config.js';
import {
  signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ─── DOM REFS ──────────────────────────────────────────────────────────────────
const loginScreen      = document.getElementById('login-screen');
const accessDenied     = document.getElementById('access-denied');
const dashboard        = document.getElementById('dashboard');
const googleSignInBtn  = document.getElementById('google-sign-in');
const signOutDenied    = document.getElementById('sign-out-denied');
const signOutBtn       = document.getElementById('sign-out-btn');
const dashUserEmail    = document.getElementById('dash-user-email');

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
let albums            = {};  // id → { name, itemCount }

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
googleSignInBtn.addEventListener('click', () => signInWithPopup(auth, provider).catch(e => toast(e.message, 'error')));
signOutBtn.addEventListener('click',     () => signOut(auth));
signOutDenied.addEventListener('click',  () => signOut(auth));

onAuthStateChanged(auth, user => {
  if (!user) {
    loginScreen.hidden  = false;
    accessDenied.hidden = true;
    dashboard.hidden    = true;
    return;
  }
  if (user.email !== AUTHORISED_EMAIL) {
    loginScreen.hidden  = true;
    accessDenied.hidden = false;
    dashboard.hidden    = true;
    signOut(auth);
    return;
  }
  // Authorised
  loginScreen.hidden  = true;
  accessDenied.hidden = true;
  dashboard.hidden    = false;
  dashUserEmail.textContent = user.email;
  loadAlbums();
});

// ─── LOAD ALBUMS ───────────────────────────────────────────────────────────────
async function loadAlbums() {
  albumList.innerHTML = '<li class="album-list-loading">Loading…</li>';
  try {
    const snap = await getDocs(query(collection(db, 'albums'), orderBy('createdAt', 'desc')));
    albumList.innerHTML = '';
    albums = {};

    if (snap.empty) {
      albumList.innerHTML = '<li class="album-list-loading">No albums yet.</li>';
      return;
    }

    snap.forEach(docSnap => {
      const d = docSnap.data();
      albums[docSnap.id] = { name: d.name, itemCount: d.itemCount || 0 };
      albumList.appendChild(buildAlbumListItem(docSnap.id, d.name, d.itemCount || 0));
    });

    // Re-select if one was previously selected
    if (selectedAlbumId && albums[selectedAlbumId]) {
      openAlbum(selectedAlbumId, albums[selectedAlbumId].name);
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

  // Update sidebar active state
  document.querySelectorAll('.album-list-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));

  panelAlbumName.textContent = name;
  panelAlbumMeta.textContent = 'Loading media…';
  dashMediaGrid.innerHTML    = '';
  dashMediaEmpty.hidden      = true;
  dashNoAlbum.hidden         = true;
  dashAlbumPanel.hidden      = false;

  try {
    const snap = await getDocs(query(collection(db, 'albums', id, 'media'), orderBy('uploadedAt', 'desc')));
    const count = snap.size;
    panelAlbumMeta.textContent = `${count} item${count !== 1 ? 's' : ''}`;

    if (snap.empty) { dashMediaEmpty.hidden = false; return; }

    snap.forEach(docSnap => {
      const m = { id: docSnap.id, ...docSnap.data() };
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
      <input class="dash-media-caption-input" type="text" value="${escHtml(m.caption || '')}" placeholder="Add caption…" maxlength="200" aria-label="Caption for this item" />
      <div class="dash-media-actions">
        <button class="btn-caption-save" aria-label="Save caption">Save</button>
        <button class="btn-media-delete" aria-label="Delete this item">Delete</button>
      </div>
    </div>`;

  // Save caption
  li.querySelector('.btn-caption-save').addEventListener('click', async () => {
    const cap = li.querySelector('.dash-media-caption-input').value.trim();
    try {
      await updateDoc(doc(db, 'albums', selectedAlbumId, 'media', m.id), { caption: cap });
      toast('Caption saved');
    } catch (err) { toast(err.message, 'error'); }
  });

  // Delete media
  li.querySelector('.btn-media-delete').addEventListener('click', async () => {
    if (!confirm(`Delete this ${m.type || 'item'}? This cannot be undone.`)) return;
    try {
      // Remove from Storage
      const storageRef = ref(storage, `explore/${selectedAlbumId}/${m.fileName}`);
      await deleteObject(storageRef).catch(() => {});
      // Remove from Firestore
      await deleteDoc(doc(db, 'albums', selectedAlbumId, 'media', m.id));
      li.remove();
      toast('Item deleted');
      // Update count
      const currentCount = parseInt(panelAlbumMeta.textContent) || 0;
      const newCount = Math.max(0, currentCount - 1);
      panelAlbumMeta.textContent = `${newCount} item${newCount !== 1 ? 's' : ''}`;
      if (dashMediaGrid.children.length === 0) dashMediaEmpty.hidden = false;
    } catch (err) { toast(err.message, 'error'); }
  });

  return li;
}

// ─── RENAME ALBUM ──────────────────────────────────────────────────────────────
renameAlbumBtn.addEventListener('click', async () => {
  const newName = prompt('New album name:', selectedAlbumName);
  if (!newName || newName.trim() === selectedAlbumName) return;
  try {
    await updateDoc(doc(db, 'albums', selectedAlbumId), { name: newName.trim() });
    selectedAlbumName = newName.trim();
    panelAlbumName.textContent = selectedAlbumName;
    toast('Album renamed');
    loadAlbums();
  } catch (err) { toast(err.message, 'error'); }
});

// ─── DELETE ALBUM ──────────────────────────────────────────────────────────────
deleteAlbumBtn.addEventListener('click', async () => {
  if (!confirm(`Delete album "${selectedAlbumName}" and ALL its media? This cannot be undone.`)) return;
  try {
    // Delete all media docs (Storage files require individual deletion — do best-effort)
    const mediaSnap = await getDocs(collection(db, 'albums', selectedAlbumId, 'media'));
    const deletions = mediaSnap.docs.map(async d => {
      const m = d.data();
      const storRef = ref(storage, `explore/${selectedAlbumId}/${m.fileName}`);
      await deleteObject(storRef).catch(() => {});
      await deleteDoc(d.ref);
    });
    await Promise.all(deletions);
    await deleteDoc(doc(db, 'albums', selectedAlbumId));
    selectedAlbumId = null;
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
  if (!name) { toast('Please enter an album name', 'error'); return; }
  try {
    await addDoc(collection(db, 'albums'), { name, createdAt: serverTimestamp(), coverImage: '', itemCount: 0 });
    newAlbumModal.hidden = true;
    toast(`Album "${name}" created`);
    loadAlbums();
  } catch (err) { toast(err.message, 'error'); }
});

newAlbumName.addEventListener('keydown', e => { if (e.key === 'Enter') confirmNewAlbum.click(); });

// ─── UPLOAD MODAL ─────────────────────────────────────────────────────────────
openUploadBtn.addEventListener('click', () => {
  pendingFiles = [];
  previewList.innerHTML = '';
  previewList.hidden    = true;
  uploadCaption.value   = '';
  startUpload.disabled  = true;
  uploadModal.hidden    = false;
});

const closeUploadModal = () => { uploadModal.hidden = true; pendingFiles = []; };
modalClose.addEventListener('click',    closeUploadModal);
cancelUpload.addEventListener('click',  closeUploadModal);

// Drop zone events
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
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
  startUpload.disabled   = true;
  cancelUpload.disabled  = true;
  modalClose.disabled    = true;
  const caption = uploadCaption.value.trim();

  let successCount = 0;
  let firstUrl     = null;

  await Promise.allSettled(pendingFiles.map((file, i) => {
    return new Promise((resolve, reject) => {
      const bar    = document.getElementById(`bar-${i}`);
      const status = document.getElementById(`status-${i}`);
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const storRef  = ref(storage, `explore/${selectedAlbumId}/${fileName}`);
      const task     = uploadBytesResumable(storRef, file);

      task.on('state_changed',
        snap => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          if (bar) bar.style.width = pct + '%';
          if (status) status.textContent = pct + '%';
        },
        err => {
          if (status) { status.textContent = 'Error'; status.className = 'preview-status preview-status--error'; }
          reject(err);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          const type = file.type.startsWith('video/') ? 'video' : 'image';
          await addDoc(collection(db, 'albums', selectedAlbumId, 'media'), {
            url, type, caption, fileName, uploadedAt: serverTimestamp()
          });
          if (!firstUrl) firstUrl = url;
          successCount++;
          if (bar) bar.style.width = '100%';
          if (status) { status.textContent = 'Done ✓'; status.className = 'preview-status preview-status--done'; }
          resolve();
        }
      );
    });
  }));

  // Update cover image if album has none
  if (firstUrl) {
    const albumRef = doc(db, 'albums', selectedAlbumId);
    const albumSnap = await getDoc(albumRef);
    if (albumSnap.exists() && !albumSnap.data().coverImage) {
      await updateDoc(albumRef, { coverImage: firstUrl });
    }
    await updateDoc(albumRef, { itemCount: (albumSnap.data().itemCount || 0) + successCount });
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
