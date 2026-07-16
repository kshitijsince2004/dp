import { Router } from 'express';
import * as fieldsController from './fields.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';

const router = Router();

const canManageFields = allow('HQ_ADMIN', 'SYSTEM_ADMIN', 'DISTRICT_OFFICER');

// Form schema endpoint — authenticated, scope-aware
router.get('/form/:record_type', authMiddleware, fieldsController.getFieldsForForm);

// Excel Lookup Routes
router.get('/lookup/acts', authMiddleware, fieldsController.listActs);
router.get('/lookup/acts/:act_cd/sections', authMiddleware, fieldsController.listSectionsForAct);
router.get('/lookup/major-heads', authMiddleware, fieldsController.listMajorHeads);
router.get('/lookup/major-heads/:major_head_code/minor-heads', authMiddleware, fieldsController.listMinorHeadsForMajorHead);
router.get('/lookup/sections/:section_code/major-heads', authMiddleware, fieldsController.listMajorHeadsForSection);
router.get('/lookup/property-categories', authMiddleware, fieldsController.listPropertyCategories);
router.get('/lookup/property-items/:parent_cd', authMiddleware, fieldsController.listPropertyItems);
router.get('/lookup/beats', authMiddleware, fieldsController.listBeats);
router.get('/lookup/local-heads', authMiddleware, fieldsController.listLocalHeads);
// India states -> districts map for address-field cascading (WP11) — static checked-in data
router.get('/lookup/state-districts', authMiddleware, fieldsController.listStateDistricts);
router.get('/lookup/record-types', authMiddleware, fieldsController.listRecordTypes);
// io_id's options_source target — scoped (enforceScope), unlike the ref.* lookups above
// which are global reference data.
router.get('/lookup/investigating-officers', authMiddleware, enforceScope, fieldsController.listInvestigatingOfficersLookup);


// Admin CRUD on field_registry
router.get('/',           authMiddleware, canManageFields, fieldsController.listAllFields);
router.post('/',          authMiddleware, canManageFields, fieldsController.createRegistryField);
router.patch('/:id',      authMiddleware, canManageFields, fieldsController.updateRegistryField);
router.patch('/:id/toggle', authMiddleware, canManageFields, fieldsController.toggleRegistryField);

export default router;

