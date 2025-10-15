async function api(path, options={}){
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers||{}) },
    credentials: 'include',
    ...options,
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error((await res.text()) || 'Request failed');
  if (ct.includes('application/json')) return await res.json();
  return await res.text();
}

function $(sel){ return document.querySelector(sel); }
function el(tag, attrs={}, children=[]) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
  });
  (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c => e.appendChild(typeof c === 'string'?document.createTextNode(c):c));
  return e;
}

let currentUser = null;

async function refreshMyImages(){
  const gallery = $('#gallery');
  gallery.innerHTML = '';
  try{
    const images = await api('/api/my/images');
    images.forEach(img => {
      const card = el('div', { class: 'card' }, [
        el('img', { src: `/uploads/${currentUser.id}/${img.filename}`, alt: img.original_name }),
        el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: new Date(img.created_at).toLocaleString() }),
          el('a', { href: `/uploads/${currentUser.id}/${img.filename}`, download: img.original_name, text: 'Download' })
        ])
      ]);
      gallery.appendChild(card);
    });
  }catch(e){
    console.error(e);
  }
}

async function showAdmin(){
  const users = await api('/api/admin/users');
  const usersDiv = $('#users');
  usersDiv.innerHTML = '';
  users.forEach(u => {
    const row = el('div', { class: 'user' }, [
      el('div', { text: `${u.name} (${u.phone})` }),
      el('div', {}, [
        el('button', { 'data-id': u.id }, ['View Images']),
        el('a', { href: `/api/admin/user/${u.id}/download` }, ['Download ZIP'])
      ])
    ]);
    row.querySelector('button').addEventListener('click', async () => {
      const images = await api(`/api/admin/user/${u.id}/images`);
      const g = $('#admin-gallery');
      g.innerHTML = '';
      images.forEach(img => {
        const card = el('div', { class: 'card' }, [
          el('img', { src: `/uploads/${u.id}/${img.filename}` }),
          el('div', { class: 'row' }, [
            el('a', { href: `/uploads/${u.id}/${img.filename}`, download: img.original_name, text: 'Download' }),
            el('button', { 'data-img': img.id }, ['Delete'])
          ])
        ]);
        card.querySelector('button').addEventListener('click', async () => {
          await api(`/api/admin/image/${img.id}`, { method: 'DELETE' });
          card.remove();
        });
        g.appendChild(card);
      });
    });
    usersDiv.appendChild(row);
  });
}

function setLoggedIn(user){
  currentUser = user;
  $('#logout-btn').style.display = 'inline-block';
  $('#upload-section').style.display = 'block';
  $('#gallery-section').style.display = 'block';
  $('#auth-section').style.display = 'none';
  $('#share-link').textContent = location.origin + '/share/' + user.share_token;
  $('#share-link').href = '/share/' + user.share_token;
  if (user.is_admin) {
    $('#admin-section').style.display = 'block';
    showAdmin().catch(console.error);
  }
  refreshMyImages();
}

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try{
    const body = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      password: form.password.value
    };
    await api('/api/register', { method: 'POST', body: JSON.stringify(body) });
    alert('Registered. Please login.');
  }catch(err){
    alert(err.message);
  }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try{
    const body = { phone: form.phone.value.trim(), password: form.password.value };
    const user = await api('/api/login', { method: 'POST', body: JSON.stringify(body) });
    setLoggedIn(user);
  }catch(err){ alert(err.message); }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

$('#upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  const files = document.getElementById('images').files;
  if (!files.length) return alert('Select images');
  for (const f of files) fd.append('images', f);
  const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) return alert('Upload failed');
  await res.json();
  document.getElementById('images').value = '';
  refreshMyImages();
});
