import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import type { Photo, Pose, StorageUsage } from '../api/models';
import { localDay } from '../tracking/tracking.store';
import { fresh } from '../api/kept';

export const POSES: Pose[] = ['FRONT', 'SIDE', 'BACK'];

/** The account's photos (newest first) and its storage. */
@Injectable({ providedIn: 'root' })
export class PhotosStore {
  private readonly api = inject(ApiService);

  readonly photos = signal<Photo[] | null>(null);
  readonly storage = signal<StorageUsage | null>(null);
  readonly todayPhotos = computed(() => (this.photos() ?? []).filter((p) => p.day === localDay()));
  readonly todayDone = computed(() => this.todayPhotos().length > 0);

  /** a picture picked in the phone's gallery from the Photos tab (1.10), for the camera screen to preview at once */
  private picked: File | null = null;

  handOver(file: File): void {
    this.picked = file;
  }

  takePicked(): File | null {
    const f = this.picked;
    this.picked = null;
    return f;
  }

  async load(): Promise<Photo[]> {
    const list = await this.api.photos();
    this.photos.set(list);
    this.at = Date.now();
    return list;
  }

  private at = 0;

  /** 1.16: the list seen less than FRESH_MS ago as it is, else the server's */
  async ensureFresh(): Promise<Photo[]> {
    const list = this.photos();
    if (list && fresh(this.at)) return list;
    return (this.loading ??= this.load().finally(() => (this.loading = null)));
  }

  private loading: Promise<Photo[]> | null = null;

  async ensure(): Promise<Photo[]> {
    return this.photos() ?? this.load();
  }

  async loadStorage(): Promise<void> {
    try {
      this.storage.set(await this.api.storage());
    } catch {
      /* the line just stays hidden */
    }
  }

  async upload(file: Blob, day: string, pose: Pose): Promise<Photo> {
    const photo = await this.api.uploadPhoto(file, day, pose);
    const rest = (this.photos() ?? []).filter((p) => !(p.day === photo.day && p.pose === photo.pose));
    this.photos.set([photo, ...rest].sort(byDayDesc));
    void this.loadStorage();
    return photo;
  }

  /** 1.16: a photo touched up: the new one takes its place in the list */
  async replace(id: string, file: Blob): Promise<Photo> {
    const photo = await this.api.replacePhoto(id, file);
    this.renamed.update((m) => ({ ...m, [id]: photo.id }));
    this.photos.update((list) => [photo, ...(list ?? []).filter((p) => p.id !== id)].sort(byDayDesc));
    void this.loadStorage();
    return photo;
  }

  async remove(id: string): Promise<void> {
    await this.api.deletePhoto(id);
    this.photos.update((list) => (list ?? []).filter((p) => p.id !== id));
    void this.loadStorage();
  }

  /** 1.16: a photo touched up gets a new id: the screens opened on the old one follow it */
  private readonly renamed = signal<Record<string, string>>({});

  resolve(id: string): string {
    const m = this.renamed();
    let x = id;
    for (let i = 0; i < 20 && m[x]; i++) x = m[x];
    return x;
  }

  /** oldest first, one pose */
  ofPose(pose: Pose): Photo[] {
    return (this.photos() ?? []).filter((p) => p.pose === pose).sort((a, b) => a.day.localeCompare(b.day));
  }

  /** the latest photo of a pose (the camera's overlay) */
  latest(pose: Pose): Photo | null {
    return (this.photos() ?? []).find((p) => p.pose === pose) ?? null;
  }

  clear(): void {
    this.renamed.set({});
    this.photos.set(null);
    this.storage.set(null);
  }
}

function byDayDesc(a: Photo, b: Photo): number {
  return b.day.localeCompare(a.day) || a.pose.localeCompare(b.pose);
}
