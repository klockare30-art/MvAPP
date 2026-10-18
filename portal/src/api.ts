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
export const myCoachAccount = impl.myCoachAccount;
export const becomeCoach = impl.becomeCoach;
export const listMyGoaltenders = impl.listMyGoaltenders;
export const addGoaltender = impl.addGoaltender;
export const clipPortalApi = impl.clipPortalApi;
export const updateGoaltender = impl.updateGoaltender;
export const setGoaltenderAccess = impl.setGoaltenderAccess;
export const eraseGoaltender = impl.eraseGoaltender;
export const listClubs = impl.listClubs;
export const saveClub = impl.saveClub;
export const deleteClub = impl.deleteClub;
export const listTeams = impl.listTeams;
export const saveTeam = impl.saveTeam;
export const deleteTeam = impl.deleteTeam;
export const deleteVideos = impl.deleteVideos;
