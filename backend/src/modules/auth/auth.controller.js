import * as authService from './auth.service.js';
import { resolveScope } from './auth.service.js';
import { getLevelFromRole } from '../../utils/generateToken.js';
import db from '../../config/db.js';
import bcrypt from 'bcryptjs';

export const login = async (req, res) => {
  const badgeNo = req.body.badgeNo || req.body.badge_no || req.body.email;
  const password = req.body.password;

  if (!badgeNo || !password) {
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'Badge number and password are required'
    });
  }

  try {
    const data = await authService.loginUser(badgeNo, password);
    return res.status(200).json({
      status: 'success',
      success: true,
      data
    });
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'INVALID_CREDENTIALS',
      message: error.message
    });
  }
};

export const refresh = async (req, res) => {
  const refreshToken = req.body.refresh_token || req.body.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'Refresh token is required'
    });
  }

  try {
    const data = await authService.refreshUserToken(refreshToken);
    return res.status(200).json({
      status: 'success',
      success: true,
      data
    });
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: error.message
    });
  }
};

export const logout = async (req, res) => {
  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    if (userId) {
      await authService.logoutUser(userId);
    }
    return res.status(200).json({
      status: 'success',
      success: true,
      data: { message: 'Logged out' }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const me = async (req, res) => {
  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized'
      });
    }

    const user = await db('users')
      .select(
        'users.id', 'users.username', 'users.badge_no', 'users.name', 'users.role',
        'users.ps_id', 'users.district_id', 'users.sub_div_id', 'users.is_active', 'users.last_login',
        'ps.name as ps_name', 'ps.code as ps_code',
        'subdiv.name as sub_div_name', 'subdiv.code as sub_div_code',
        'dist.name as district_name', 'dist.code as district_code'
      )
      .leftJoin('hierarchy_nodes as ps', 'users.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as subdiv', 'users.sub_div_id', 'subdiv.id')
      .leftJoin('hierarchy_nodes as dist', 'users.district_id', 'dist.id')
      .where('users.id', userId)
      .first();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found'
      });
    }

    // Backfill scope ids (and their names) when only ps_id/sub_div_id is stored
    const scope = await resolveScope(user);
    let subDivName = user.sub_div_name;
    let districtName = user.district_name;
    if (!user.sub_div_id && scope.sub_div_id) {
      const node = await db('hierarchy_nodes').where({ id: scope.sub_div_id }).first();
      subDivName = node?.name || null;
    }
    if (!user.district_id && scope.district_id) {
      const node = await db('hierarchy_nodes').where({ id: scope.district_id }).first();
      districtName = node?.name || null;
    }

    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          badge_no: user.badge_no,
          name: user.name,
          role: user.role,
          level: getLevelFromRole(user.role),
          ps_id: scope.ps_id,
          district_id: scope.district_id,
          sub_div_id: scope.sub_div_id,
          is_active: !!user.is_active,
          last_login: user.last_login,
          ps_name: user.ps_name || null,
          ps_code: user.ps_code || null,
          sub_div_name: subDivName || null,
          district_name: districtName || null
        },
        jurisdiction: {
          station: scope.ps_id ? { id: scope.ps_id, name: user.ps_name, code: user.ps_code } : null,
          sub_division: scope.sub_div_id ? { id: scope.sub_div_id, name: subDivName } : null,
          district: scope.district_id ? { id: scope.district_id, name: districtName } : null
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const changePassword = async (req, res) => {
  const oldPassword = req.body.oldPassword || req.body.old_password;
  const newPassword = req.body.newPassword || req.body.new_password;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      status: 'error',
      success: false,
      code: 'BAD_REQUEST',
      message: 'Old and new passwords are required'
    });
  }

  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        success: false,
        code: 'BAD_REQUEST',
        message: 'Incorrect old password'
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id: userId }).update({ password_hash: newHash });

    // Force re-login by deleting refresh token from Redis
    await authService.logoutUser(userId);

    return res.status(200).json({
      status: 'success',
      success: true,
      data: { message: 'Password updated' }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    const list = await db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(50);
    return res.status(200).json({
      status: 'success',
      success: true,
      data: { notifications: list }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const markNotificationRead = async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    await db('notifications')
      .where({ id, user_id: userId })
      .update({ is_read: true });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: { message: 'Notification marked as read' }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};
