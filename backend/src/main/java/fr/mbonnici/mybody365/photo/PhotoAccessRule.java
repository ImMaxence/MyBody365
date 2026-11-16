package fr.mbonnici.mybody365.photo;

import java.util.UUID;

/**
 * Who else than the owner may see a photo: a friend it was shared with, an admin when it was reported.
 * Nobody else, admins included.
 */
public interface PhotoAccessRule {

    boolean canView(Photo photo, UUID viewerId);
}
