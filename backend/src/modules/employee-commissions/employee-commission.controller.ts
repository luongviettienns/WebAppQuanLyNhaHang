import type { NextFunction, Request, Response } from 'express';
import { EmployeeCommissionMutationService } from './employee-commission.mutation.service';
import { EmployeeCommissionQueryService } from './employee-commission.query.service';
import {
  parseCommissionAssignmentCreateInput,
  parseCommissionAssignmentInput,
  parseCommissionId,
  parseCommissionListQuery,
  parseCommissionPlanArchiveInput,
  parseCommissionPlanCreateInput,
  parseCommissionPlanUpdateInput,
  parseCommissionReassignInput,
  parseCommissionResolutionInput,
  parseCommissionRetryInput,
  parseCommissionRuleCreateInput,
  parseCommissionWorkspaceQuery
} from './employee-commission.schemas';

function actor(req: Request) {
  return { id: req.user!.id, name: req.user!.name };
}

export class EmployeeCommissionController {
  static async workspace(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeeCommissionQueryService.workspace(parseCommissionWorkspaceQuery(req.query)) }); }
    catch (error) { next(error); }
  }

  static async assignees(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = parseCommissionWorkspaceQuery({ branchId: req.query.branchId }).branchId;
      res.json({ data: await EmployeeCommissionQueryService.assignees(branchId, req.user!.id) });
    } catch (error) { next(error); }
  }

  static async issues(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeeCommissionQueryService.issues(parseCommissionListQuery(req.query)) }); }
    catch (error) { next(error); }
  }

  static async ledger(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeeCommissionQueryService.ledger(parseCommissionListQuery(req.query)) }); }
    catch (error) { next(error); }
  }

  static async createPlan(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: { plan: await EmployeeCommissionMutationService.createPlan(parseCommissionPlanCreateInput(req.body), actor(req)) } }); }
    catch (error) { next(error); }
  }

  static async updatePlan(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: { plan: await EmployeeCommissionMutationService.updatePlan(parseCommissionId(req.params.id), parseCommissionPlanUpdateInput(req.body), actor(req)) } }); }
    catch (error) { next(error); }
  }

  static async activatePlan(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: { plan: await EmployeeCommissionMutationService.activatePlan(parseCommissionId(req.params.id), actor(req)) } }); }
    catch (error) { next(error); }
  }

  static async archivePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseCommissionPlanArchiveInput(req.body);
      res.json({ data: { plan: await EmployeeCommissionMutationService.archivePlan(parseCommissionId(req.params.id), input.reason, actor(req)) } });
    } catch (error) { next(error); }
  }

  static async createRule(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: { rule: await EmployeeCommissionMutationService.createRule(parseCommissionId(req.params.id), parseCommissionRuleCreateInput(req.body), actor(req)) } }); }
    catch (error) { next(error); }
  }

  static async createAssignment(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: { assignment: await EmployeeCommissionMutationService.createAssignment(parseCommissionId(req.params.id), parseCommissionAssignmentCreateInput(req.body), actor(req)) } }); }
    catch (error) { next(error); }
  }

  static async assignOrderItem(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseCommissionAssignmentInput(req.body);
      res.json({ data: { orderItem: await EmployeeCommissionMutationService.assignOrderItem(parseCommissionId(req.params.id), input.commissionEmployeeId, actor(req)) } });
    } catch (error) { next(error); }
  }

  static async createResolution(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: { resolution: await EmployeeCommissionMutationService.createResolution(parseCommissionId(req.params.id), parseCommissionResolutionInput(req.body), actor(req)) } }); }
    catch (error) { next(error); }
  }

  static async retryIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseCommissionRetryInput(req.body);
      res.json({ data: await EmployeeCommissionMutationService.retryIssue(parseCommissionId(req.params.id), input.idempotencyKey, actor(req)) });
    } catch (error) { next(error); }
  }

  static async reassignOrderItem(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeeCommissionMutationService.reassignOrderItem(parseCommissionId(req.params.id), parseCommissionReassignInput(req.body), actor(req)) }); }
    catch (error) { next(error); }
  }
}
