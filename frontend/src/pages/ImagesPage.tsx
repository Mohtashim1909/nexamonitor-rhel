import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Layers,
  Search,
  HardDrive,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Tag,
  ArrowDownToLine,
  RefreshCw,
  AlertTriangle,
  Info,
  Terminal,
  Server,
  FileCode,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DemoModeBanner, LiveModeBanner } from '@/components/shared/DemoModeBanner';
import { SearchInput } from '@/components/shared/SearchInput';
import { EmptyState } from '@/components/shared/EmptyState';
import { DEMO_IMAGES } from '@/data/demo';
import { formatBytes } from '@/utils/format';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/api';
import { clsx } from 'clsx';
import type { DockerImage, ImageInspectData, ImagePruneResponse } from '@/types';

export function ImagesPage() {
  const { isDemoMode } = useApp();
  const [images, setImages] = useState<DockerImage[]>(DEMO_IMAGES);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in_use' | 'unused' | 'dangling'>('all');
  const [notice, setNotice] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<DockerImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inspect Modal State
  const [inspectImage, setInspectImage] = useState<DockerImage | null>(null);
  const [inspectData, setInspectData] = useState<ImageInspectData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Prune State
  const [isPruning, setIsPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<ImagePruneResponse | null>(null);

  // Fetch images from backend or demo
  const fetchImages = useCallback(async () => {
    if (isDemoMode) {
      setImages(DEMO_IMAGES);
      return;
    }

    try {
      setLoading(true);
      const liveImages = await api.images.list();
      setImages(liveImages || []);
    } catch (err: any) {
      setNotice({ message: `Failed to fetch Docker images: ${err?.message || err}`, type: 'error' });
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const filtered = useMemo(() => {
    return images.filter((img) => {
      const matchSearch =
        !search ||
        img.name.toLowerCase().includes(search.toLowerCase()) ||
        img.tag.toLowerCase().includes(search.toLowerCase()) ||
        img.id.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filterType === 'all' ||
        (filterType === 'in_use' && (img.in_use || (img.container_count && img.container_count > 0))) ||
        (filterType === 'unused' && !img.in_use && (!img.container_count || img.container_count === 0)) ||
        (filterType === 'dangling' && (img.is_dangling || img.tag === '<none>' || img.name === '<none>'));

      return matchSearch && matchFilter;
    });
  }, [images, search, filterType]);

  const totalImageSize = useMemo(() => {
    return images.reduce((acc, img) => acc + img.size, 0);
  }, [images]);

  const unusedCount = images.filter((i) => !i.in_use && (!i.container_count || i.container_count === 0)).length;
  const danglingCount = images.filter((i) => i.is_dangling || i.tag === '<none>' || i.name === '<none>').length;

  // Handle Pruning Dangling Images
  const handlePruneDangling = async () => {
    if (isDemoMode) {
      setNotice({
        message: '[Demo Mode] Pruned 2 dangling images, reclaiming 412 MB.',
        type: 'success',
      });
      setTimeout(() => setNotice(null), 4000);
      return;
    }

    try {
      setIsPruning(true);
      const res = await api.images.prune(true);
      setPruneResult(res);
      setNotice({
        message: `Successfully pruned ${res.images_deleted.length} dangling image(s), reclaiming ${res.space_reclaimed_mb.toFixed(1)} MB disk space!`,
        type: 'success',
      });
      await fetchImages();
    } catch (err: any) {
      setNotice({
        message: `Failed to prune dangling images: ${err?.message || err}`,
        type: 'error',
      });
    } finally {
      setIsPruning(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  // Inspect Image Handler
  const handleOpenInspect = async (img: DockerImage) => {
    setInspectImage(img);
    setInspectData(null);
    setInspectLoading(true);

    if (isDemoMode) {
      // Simulate inspect metadata in demo mode
      setTimeout(() => {
        setInspectData({
          id: img.id,
          tags: img.tags || [img.name + ':' + img.tag],
          created: img.created,
          size_bytes: img.size,
          size_mb: img.size / (1024 * 1024),
          virtual_size_bytes: img.size,
          architecture: 'arm64 / x86_64',
          os: 'linux',
          docker_version: '25.0.3',
          author: 'Demo Maintainer',
          entrypoint: ['/usr/local/bin/docker-entrypoint.sh'],
          cmd: ['server', '--config', '/etc/app.yaml'],
          env: ['NODE_ENV=production', 'PORT=8080', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin'],
          working_dir: '/app',
          labels: { 'maintainer': 'NexaMonitor Team', 'version': '1.0' },
          layer_count: 7,
          layers: [
            'sha256:7305141e069b2d9e68b32c6ff62a5b28a9b3a9e224e78a6ff6786c57f202534f',
            'sha256:d8269d0d93be4219e59d48b111dc54b2fc5d381005a96aa500803517de69dc2e',
            'sha256:5e60802c676d91cb6181f08fa2c6599b4d8d1cf57b8555e76a6cf9c8b74681fb',
          ],
          exposed_ports: ['80/tcp', '443/tcp'],
        });
        setInspectLoading(false);
      }, 200);
      return;
    }

    try {
      const data = await api.images.inspect(img.id);
      setInspectData(data);
    } catch (err: any) {
      setNotice({
        message: `Failed to inspect image: ${err?.message || err}`,
        type: 'error',
      });
    } finally {
      setInspectLoading(false);
    }
  };

  const confirmDeleteImage = async () => {
    if (!imageToDelete) return;
    setIsDeleting(true);
    try {
      if (isDemoMode) {
        setImages((prev) => prev.filter((i) => i.id !== imageToDelete.id));
        setNotice({
          message: `[Demo Mode] Removed simulated image ${imageToDelete.name}`,
          type: 'success',
        });
      } else {
        const res = await api.images.remove(imageToDelete.id, true);
        const reclaimedStr = res.reclaimed_bytes ? ` (Reclaimed ${formatBytes(res.reclaimed_bytes)})` : '';
        setNotice({
          message: (res.message || `Removed image ${imageToDelete.name}`) + reclaimedStr,
          type: 'success',
        });
        await fetchImages();
      }
    } catch (err: any) {
      setNotice({
        message: `Failed to remove image: ${err?.message || err}`,
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
      setImageToDelete(null);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {isDemoMode ? <DemoModeBanner /> : <LiveModeBanner />}

      {notice && (
        <div
          className={clsx(
            'border text-xs px-4 py-2.5 rounded-lg flex items-center justify-between transition-all',
            notice.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          )}
        >
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white font-bold ml-4">
            ×
          </button>
        </div>
      )}

      <PageHeader
        title="Docker Images Registry"
        subtitle="Local container image layers, storage footprint, deep inspection, and safe pruning"
        badge={`${images.length} Local Images`}
        actions={
          <div className="flex items-center gap-2">
            {!isDemoMode && (
              <button
                onClick={fetchImages}
                title="Refresh Docker images"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60"
              >
                <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin text-blue-400')} />
              </button>
            )}
            <button
              onClick={handlePruneDangling}
              disabled={isPruning}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isPruning ? 'Pruning...' : `Prune Dangling (${danglingCount})`}</span>
            </button>
          </div>
        }
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-black/20">
          <div>
            <div className="text-xs text-slate-400">Total Image Footprint</div>
            <div className="text-xl font-bold text-white font-mono mt-0.5">
              {formatBytes(totalImageSize)}
            </div>
          </div>
          <HardDrive className="w-6 h-6 text-blue-400 opacity-80" />
        </div>

        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-black/20">
          <div>
            <div className="text-xs text-slate-400">In Active Use</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
              {images.filter((i) => i.in_use || (i.container_count && i.container_count > 0)).length}
            </div>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-400 opacity-80" />
        </div>

        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-black/20">
          <div>
            <div className="text-xs text-slate-400">Dangling / Unreferenced</div>
            <div className="text-xl font-bold text-amber-400 font-mono mt-0.5">
              {danglingCount} ({unusedCount} Unused)
            </div>
          </div>
          <AlertCircle className="w-6 h-6 text-amber-400 opacity-80" />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search images by name, tag or hash..."
            className="flex-1"
          />
          <div className="flex gap-1 bg-[#111827] border border-slate-800/80 rounded-lg p-1">
            {[
              { label: 'All', value: 'all' },
              { label: 'In Use', value: 'in_use' },
              { label: 'Unused', value: 'unused' },
              { label: 'Dangling', value: 'dangling' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterType(f.value as any)}
                className={clsx(
                  'px-3 py-1.5 rounded text-xs font-medium transition-all capitalize',
                  filterType === f.value
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {filtered.length} of {images.length} image{images.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Images Table */}
      <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/40">
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Repository & Tag
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Image ID
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Disk Size
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Containers
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <EmptyState
                      icon={Layers}
                      title="No Docker Images Found"
                      description={loading ? "Loading images from Docker Engine..." : "No image matches the current search keywords or status filter."}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((img) => (
                  <tr key={img.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="text-white font-mono font-semibold flex items-center gap-2">
                        <span>{img.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                          {img.tag}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {img.tags && img.tags.length > 0 ? img.tags.join(', ') : '<none>'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      {img.id.replace('sha256:', '').substring(0, 12)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-200">
                      {formatBytes(img.size)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-300">
                      {img.container_count || 0} container{img.container_count !== 1 ? 's' : ''}
                    </td>
                    <td className="py-3.5 px-4">
                      {img.in_use || (img.container_count && img.container_count > 0) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          In-Use
                        </span>
                      ) : img.is_dangling || img.tag === '<none>' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Dangling
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Unused
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenInspect(img)}
                          title="Inspect Image Layers & Metadata"
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setImageToDelete(img)}
                          title="Delete image"
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deep Image Inspect Modal */}
      {inspectImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111827] border border-slate-700/80 rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm font-mono">{inspectImage.name}:{inspectImage.tag}</h3>
                  <p className="text-slate-400 text-xs font-mono">{inspectImage.id.slice(0, 19)}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectImage(null)}
                className="text-slate-400 hover:text-white text-base px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            {inspectLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                <span>Reading image metadata from Docker Engine...</span>
              </div>
            ) : inspectData ? (
              <div className="overflow-y-auto space-y-4 pr-1 text-xs">
                {/* Basic specs grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-500 block text-[10px]">OS / Arch</span>
                    <span className="font-mono text-white">{inspectData.os} / {inspectData.architecture}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Disk Footprint</span>
                    <span className="font-mono text-white">{inspectData.size_mb.toFixed(1)} MB</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Layers Count</span>
                    <span className="font-mono text-white">{inspectData.layer_count} layers</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Docker Engine</span>
                    <span className="font-mono text-white">{inspectData.docker_version || 'N/A'}</span>
                  </div>
                </div>

                {/* Entrypoint & CMD */}
                <div className="space-y-1.5">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5 text-xs">
                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                    <span>Entrypoint & Command Execution</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 font-mono text-[11px] text-slate-300 space-y-1">
                    <div>
                      <span className="text-slate-500">Entrypoint: </span>
                      <span className="text-emerald-400">
                        {inspectData.entrypoint && inspectData.entrypoint.length > 0 ? inspectData.entrypoint.join(' ') : '<none>'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">CMD: </span>
                      <span className="text-blue-300">
                        {inspectData.cmd && inspectData.cmd.length > 0 ? inspectData.cmd.join(' ') : '<none>'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Working Dir: </span>
                      <span className="text-slate-300">{inspectData.working_dir || '/'}</span>
                    </div>
                  </div>
                </div>

                {/* Environment Variables */}
                <div className="space-y-1.5">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5 text-xs">
                    <FileCode className="w-3.5 h-3.5 text-purple-400" />
                    <span>Environment Variables ({inspectData.env.length})</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-mono text-[10px] text-slate-300 max-h-32 overflow-y-auto space-y-0.5">
                    {inspectData.env.map((envVar, idx) => (
                      <div key={idx} className="truncate">{envVar}</div>
                    ))}
                  </div>
                </div>

                {/* Layers Digest list */}
                <div className="space-y-1.5">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5 text-xs">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Image Layers ({inspectData.layer_count})</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-mono text-[10px] text-slate-400 max-h-28 overflow-y-auto space-y-1">
                    {inspectData.layers.map((layer, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-slate-600">#{idx + 1}</span>
                        <span className="text-slate-300 truncate">{layer}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">No metadata available.</div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setInspectImage(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Image Confirmation Modal */}
      {imageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111827] border border-rose-500/30 rounded-xl max-w-md w-full p-6 shadow-2xl shadow-rose-950/40 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Delete Docker Image</h3>
                <p className="text-slate-400 text-xs">Remove image layers from local Docker storage.</p>
              </div>
            </div>

            {imageToDelete.container_count && imageToDelete.container_count > 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">In-Use Image Warning</div>
                  <div>This image is currently referenced by {imageToDelete.container_count} container(s). Deletion will force removal of unshared layers.</div>
                </div>
              </div>
            ) : null}

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 space-y-1">
              <div>
                <span className="text-slate-500">Repository:</span> <span className="font-mono text-white">{imageToDelete.name}:{imageToDelete.tag}</span>
              </div>
              <div>
                <span className="text-slate-500">Image ID:</span> <span className="font-mono text-slate-400">{imageToDelete.id}</span>
              </div>
              <div>
                <span className="text-slate-500">Footprint:</span> <span className="font-mono text-slate-400">{formatBytes(imageToDelete.size)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={isDeleting}
                onClick={() => setImageToDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isDeleting}
                onClick={confirmDeleteImage}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
