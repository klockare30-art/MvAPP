import { demoApi, IS_DEMO } from './demo';
import * as real from './supabaseApi';

// The demo build swaps the backend for in-browser example data; everything else is identical.
const impl = IS_DEMO ? demoApi : real;

export const claimProfiles = impl.claimProfiles;
export const loadProfiles = impl.loadProfiles;
export const loadVideos = impl.loadVideos;
export const loadVideo = impl.loadVideo;
export const signedVideoUrl = impl.signedVideoUrl;
export const loadComments = impl.loadComments;
export const addComment = impl.addComment;
export const deleteComment = impl.deleteComment;
export const isAdmin = impl.isAdmin;
export const adminListCoaches = impl.adminListCoaches;
export const adminUpdateCoach = impl.adminUpdateCoach;
export const loadPlans = impl.loadPlans;
export const adminSavePlan = impl.adminSavePlan;
export const isCoach = impl.isCoach;
