import { useState } from 'react';
import Modal from '../Layout/Modal';
import SoldForm from './SoldForm';
import PhotoIdentify from './PhotoIdentify';
import { useAuth } from '../../contexts/AuthContext';
import { useShop } from '../../contexts/ShopContext';
import {
  CATEGORIES,
  SPORTS,
  LEAGUES_BY_SPORT,
  ITEM_TYPES,
  GRADING_COMPANIES,
  ACQUIRED_SOURCES,
  ITEM_STATUS,
} from '../../utils/constants';
import { toNumberOrNull, money, shortDate } from '../../utils/format';
import { openEbaySold, openImageSearch } from '../../utils/ebay';
import { compressImage } from '../../utils/image';
import { addItem, updateItem, deleteItem, unmarkSold } from '../../services/items.service';
import { uploadItemPhoto, deleteItemPhoto } from '../../services/storage.service';

// Turn a Firebase Storage error into something readable — and keep the raw
// code visible, since it points straight at the cause (rules vs. App Check vs.
// bucket not set up vs. network).
const photoErrorMessage = (err) => {
  const code = err?.code || '';
  const base = {
    'storage/unauthorized':
      "Storage denied the upload. It's a Storage rules / permission issue (or App Check).",
    'storage/unauthenticated': 'You appear to be signed out. Sign in again and retry.',
    'storage/retry-limit-exceeded': 'The upload kept timing out — check your connection and retry.',
    'storage/canceled': 'The upload was canceled.',
    'storage/quota-exceeded': 'The project storage quota is full.',
    'storage/object-not-found': 'Storage path not found.',
    'storage/unknown': "Storage returned an unknown error — often the bucket isn't set up yet.",
  }[code];
  const detail = base || err?.message || 'Unknown error.';
  return code ? `${detail}  [${code}]` : detail;
};

// Snap a free-text value from the AI onto one of our fixed dropdown options.
// Case-insensitive exact match first, then a loose contains-match (so
// "Trading Card" → "Trading Cards", "Pokémon Card" → "Card"). No match → "".
const matchOption = (val, options) => {
  if (!val) return '';
  const v = String(val).trim().toLowerCase();
  if (!v) return '';
  return (
    options.find((o) => o.toLowerCase() === v) ||
    options.find((o) => {
      const ol = o.toLowerCase();
      return ol.includes(v) || v.includes(ol);
    }) ||
    ''
  );
};

const emptyForm = {
  name: '',
  pricePaid: '',
  acquiredFrom: '',
  acquiredAt: '',
  category: '',
  sport: '',
  league: '',
  itemType: '',
  graded: false,
  grade: '',
  gradingCompany: '',
  assignedTo: '',
  tags: [],
  notes: '',
};

const fromItem = (item) => ({
  name: item.name || '',
  pricePaid: item.pricePaid ?? '',
  acquiredFrom: item.acquiredFrom || '',
  acquiredAt: item.acquiredAt ? item.acquiredAt.slice(0, 10) : '',
  category: item.category || '',
  sport: item.sport || '',
  league: item.league || '',
  itemType: item.itemType || '',
  graded: !!item.graded,
  grade: item.grade || '',
  gradingCompany: item.gradingCompany || '',
  assignedTo: item.assignedTo || '',
  tags: item.tags || [],
  notes: item.notes || '',
});

const ItemDetail = ({ mode, item, onClose }) => {
  const { user } = useAuth();
  const { activeShopId } = useShop();
  const isEdit = mode === 'edit';

  const [form, setForm] = useState(isEdit ? fromItem(item) : emptyForm);
  const [tagInput, setTagInput] = useState('');
  const [photos, setPhotos] = useState(item?.photos || []);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  // The most recent photo File added this session — kept in memory so "Identify
  // with AI" can reuse it without re-shooting (and without fetching a Storage
  // URL, which CORS blocks). Lost on reload, which is fine: pick a photo then.
  const [lastPhotoFile, setLastPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSold, setShowSold] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sold = isEdit && item.status === ITEM_STATUS.SOLD;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] });
    setTagInput('');
  };

  const removeTag = (t) => set({ tags: form.tags.filter((x) => x !== t) });

  const serialize = () => ({
    name: form.name.trim() || 'Untitled item',
    pricePaid: toNumberOrNull(form.pricePaid),
    acquiredFrom: form.acquiredFrom.trim(),
    acquiredAt: form.acquiredAt ? new Date(form.acquiredAt).toISOString() : null,
    category: form.category,
    sport: form.sport, // a sport can apply to any category (a card, a jersey…)
    league: form.league,
    itemType: form.itemType,
    graded: form.graded,
    grade: form.graded ? form.grade.trim() : '',
    gradingCompany: form.graded ? form.gradingCompany : '',
    assignedTo: form.assignedTo.trim(),
    tags: form.tags,
    notes: form.notes.trim(),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateItem(item.id, serialize());
      } else {
        await addItem(activeShopId, user.uid, { ...serialize(), photos: [] });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !isEdit) return;
    setUploading(true);
    setPhotoError('');
    try {
      const added = [];
      let lastPrepared = null;
      for (const file of files) {
        // Downscale big phone photos to fit under the 5 MB storage cap. If
        // compression itself fails (odd format, etc.) fall back to the original
        // so the upload — and its error, if any — is about Storage, not canvas.
        let prepared = file;
        try {
          prepared = await compressImage(file);
        } catch (err) {
          console.error('Image compression failed, using original:', err);
        }
        const p = await uploadItemPhoto(activeShopId, item.id, prepared);
        added.push(p);
        lastPrepared = prepared;
      }
      if (lastPrepared) setLastPhotoFile(lastPrepared);
      const next = [...photos, ...added];
      setPhotos(next);
      await updateItem(item.id, { photos: next });
    } catch (err) {
      console.error('Photo upload failed:', err);
      setPhotoError(photoErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photo) => {
    const next = photos.filter((p) => p.path !== photo.path);
    setPhotos(next);
    await updateItem(item.id, { photos: next });
    await deleteItemPhoto(photo.path);
  };

  // Apply an AI photo-identification candidate. The model's field values are
  // free text ("Trading Card", "Pokémon Card"…), so snap each to the matching
  // dropdown option — otherwise the <select> can't show it and it looks like
  // nothing happened. Anything with no match is dropped rather than left as an
  // invalid value. Name falls back to the label. Never clobbers existing input.
  const applyCandidate = (c) =>
    setForm((f) => {
      const category = matchOption(c.category, CATEGORIES);
      const sport = matchOption(c.sport, SPORTS);
      const league = sport ? matchOption(c.league, LEAGUES_BY_SPORT[sport] || []) : '';
      const itemType = matchOption(c.itemType, ITEM_TYPES);
      const gradingCompany = matchOption(c.gradingCompany, GRADING_COMPANIES);
      const graded = c.graded === true;
      // Merge AI tags (+ the year as a tag) into whatever's already there.
      const aiTags = [...(Array.isArray(c.tags) ? c.tags : []), c.year]
        .map((t) => String(t || '').trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean);
      const tags = Array.from(new Set([...f.tags, ...aiTags]));
      return {
        ...f,
        name: (c.name || c.label || '').trim() || f.name,
        category: category || f.category,
        sport: sport || f.sport,
        league: league || f.league,
        itemType: itemType || f.itemType,
        graded: graded || f.graded,
        gradingCompany: graded && gradingCompany ? gradingCompany : f.gradingCompany,
        grade: graded && c.grade ? String(c.grade) : f.grade,
        tags,
        // Only fill notes if the user hasn't written their own.
        notes: f.notes.trim() ? f.notes : String(c.notes || '').trim(),
      };
    });

  // The first photo is the cover: it's the card thumbnail and the one "Search
  // by photo" uses. Making a photo the cover just moves it to the front.
  const setCover = async (photo) => {
    const next = [photo, ...photos.filter((p) => p.path !== photo.path)];
    setPhotos(next);
    await updateItem(item.id, { photos: next });
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await Promise.all((photos || []).map((p) => deleteItemPhoto(p.path)));
      await deleteItem(item.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const leagues = LEAGUES_BY_SPORT[form.sport] || [];

  return (
    <Modal title={isEdit ? 'Item details' : 'Add item'} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="label">Name *</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. 2003 Topps LeBron James Rookie"
            autoFocus={!isEdit}
          />
        </div>

        {/* AI identify — reuse the photo added this session, or snap/choose one */}
        <PhotoIdentify onApply={applyCandidate} currentFile={lastPhotoFile} />

        {/* Sold banner (edit mode) */}
        {sold && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-center justify-between">
              <div>
                <strong>Sold for {money(item.sold?.price)}</strong>
                {item.sold?.soldAt && <> on {shortDate(item.sold.soldAt)}</>}
                {item.sold?.channel && <> · {item.sold.channel}</>}
                {item.sold?.buyer && <> · to {item.sold.buyer}</>}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setShowSold(true)}>
                Edit sale
              </button>
              <button
                className="btn-secondary px-3 py-1 text-xs"
                onClick={async () => { await unmarkSold(item.id); onClose(); }}
              >
                Move back to stock
              </button>
            </div>
          </div>
        )}

        {/* Photos (edit only — needs a saved item to attach to) */}
        {isEdit ? (
          <div>
            <label className="label">Photos</label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div
                  key={p.path}
                  className={`group relative h-24 w-24 overflow-hidden rounded-lg bg-slate-100 ${
                    i === 0 ? 'ring-2 ring-sky-500' : ''
                  }`}
                >
                  <img src={p.url} alt={i === 0 ? 'Cover photo' : `Photo ${i + 1}`} className="h-full w-full object-cover" />
                  {i === 0 ? (
                    <span className="absolute left-1 top-1 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Cover
                    </span>
                  ) : (
                    <button
                      onClick={() => setCover(p)}
                      className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/80"
                      title="Use as cover / title photo"
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    onClick={() => removePhoto(p)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {/* Take a photo (opens the camera on mobile) */}
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs text-slate-400 hover:border-sky-400 hover:text-sky-500">
                {uploading ? '…' : (<><span className="text-xl">📷</span>Take photo</>)}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotos}
                  disabled={uploading}
                />
              </label>
              {/* Upload from library / files (multiple allowed) */}
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs text-slate-400 hover:border-sky-400 hover:text-sky-500">
                {uploading ? '…' : (<><span className="text-xl">🖼️</span>Upload</>)}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotos}
                  disabled={uploading}
                />
              </label>
            </div>
            {photoError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {photoError}
              </p>
            )}
            {photos.length > 1 && (
              <p className="mt-1 px-1 text-xs text-slate-400">
                The cover (outlined) is the thumbnail and the photo used by “Search by photo.”
                Tap “Make cover” on any other photo to change it.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            📷 Save the item first, then reopen it to add or upload photos.
          </p>
        )}

        {/* Cost + acquisition */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Paid (optional)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                className="field pl-6"
                inputMode="decimal"
                placeholder="Look it up later"
                value={form.pricePaid}
                onChange={(e) => set({ pricePaid: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Acquired on (optional)</label>
            <input
              type="date"
              className="field"
              value={form.acquiredAt}
              onChange={(e) => set({ acquiredAt: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Where you got it (optional)</label>
          <input
            className="field"
            list="acquired-sources"
            placeholder="Card show, eBay, had it forever…"
            value={form.acquiredFrom}
            onChange={(e) => set({ acquiredFrom: e.target.value })}
          />
          <datalist id="acquired-sources">
            {ACQUIRED_SOURCES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Category cascade */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select
              className="field"
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="field"
              value={form.itemType}
              onChange={(e) => set({ itemType: e.target.value })}
            >
              <option value="">—</option>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sport</label>
            <select
              className="field"
              value={form.sport}
              onChange={(e) => set({ sport: e.target.value, league: '' })}
            >
              <option value="">—</option>
              {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">League</label>
            <select
              className="field"
              value={form.league}
              onChange={(e) => set({ league: e.target.value })}
              disabled={!form.sport}
            >
              <option value="">—</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Grading */}
        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={form.graded}
              onChange={(e) => set({ graded: e.target.checked })}
            />
            Graded
          </label>
          {form.graded && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Company</label>
                <select
                  className="field"
                  value={form.gradingCompany}
                  onChange={(e) => set({ gradingCompany: e.target.value })}
                >
                  <option value="">—</option>
                  {GRADING_COMPANIES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Grade</label>
                <input
                  className="field"
                  placeholder="e.g. 9.5, Gem Mint 10"
                  value={form.grade}
                  onChange={(e) => set({ grade: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Assigned + tags */}
        <div>
          <label className="label">Assigned to (optional)</label>
          <input
            className="field"
            placeholder="Whose pile is this in?"
            value={form.assignedTo}
            onChange={(e) => set({ assignedTo: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Tags</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {form.tags.map((t) => (
              <span key={t} className="chip bg-sky-100 text-sky-700">
                #{t}
                <button onClick={() => removeTag(t)} className="ml-1 text-sky-500 hover:text-sky-800">✕</button>
              </span>
            ))}
          </div>
          <input
            className="field"
            placeholder="Type a tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <textarea
            className="field"
            rows={2}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

        {/* Comps / value lookups */}
        <div>
          <div className="label">Look up value</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => openEbaySold({ ...serialize() })}
              className="btn-secondary flex-1 text-sm"
              disabled={!form.name.trim()}
              title="Recently sold eBay listings for this name"
            >
              🔎 eBay sold prices
            </button>
            <button
              type="button"
              onClick={() => openImageSearch(photos[0]?.url)}
              className="btn-secondary flex-1 text-sm"
              disabled={!photos.length}
              title={photos.length ? 'Reverse image search this photo' : 'Add a photo first'}
            >
              🖼️ Search by photo
            </button>
          </div>
          {!photos.length && (
            <p className="mt-1 px-1 text-xs text-slate-400">
              Add a photo to enable visual search (Google Lens).
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
          </button>
          {isEdit && !sold && (
            <button className="btn-success" onClick={() => setShowSold(true)} disabled={saving}>
              Mark sold
            </button>
          )}
          {isEdit && (
            confirmDelete ? (
              <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                Confirm delete
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Delete
              </button>
            )
          )}
        </div>
      </div>

      {showSold && (
        <SoldForm item={item} onClose={() => setShowSold(false)} onSold={onClose} />
      )}
    </Modal>
  );
};

export default ItemDetail;
