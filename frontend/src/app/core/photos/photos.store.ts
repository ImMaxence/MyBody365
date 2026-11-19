import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import type { Photo, Pose, StorageUsage } from '../api/models';
import { localDay } from '../tracking/tracking.store';

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
    return list;
  }

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

  async remove(id: string): Promise<void> {
    await this.api.deletePhoto(id);
    this.photos.update((list) => (list ?? []).filter((p) => p.id !== id));
    void this.loadStorage();
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
    this.photos.set(null);
    this.storage.set(null);
  }
}

function byDayDesc(a: Photo, b: Photo): number {
  return b.day.localeCompare(a.day) || a.pose.localeCompare(b.pose);
}
