import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController, AuthGuard } from './auth';
import { Db } from './db';
import { Cache } from './redis';
import { Events } from './realtime';
import { Jobs } from './jobs';
import { CatalogController } from './modules/catalog';
import { Orders, OrdersController } from './modules/orders';
import { KitchenService, KitchenController } from './modules/kitchen';
import { DispatchService, RiderController } from './modules/dispatch';
import { InventoryController } from './modules/inventory';
import { PosController } from './modules/pos';
import { StaffController } from './modules/staff';
import { ReportsController } from './modules/reports';
import { AdminController } from './modules/admin';
import { PaymentsController } from './modules/payments';
import { HealthController } from './health';
import { OperationsController } from './modules/operations';
import { EngagementController, SupportController } from './modules/engagement';
import { HospitalityController } from './modules/hospitality';
import { ProcurementController } from './modules/procurement';
import { EnterpriseController } from './modules/enterprise';
import { AdvancedPosController } from './modules/advanced-pos';
import { InsightsController } from './modules/insights';
import { StripeController } from './modules/stripe';
import { ProofController } from './modules/proof';
@Module({
  controllers: [
    EngagementController,
    SupportController,
    HospitalityController,
    ProcurementController,
    EnterpriseController,
    AdvancedPosController,
    InsightsController,
    StripeController,
    ProofController,
    AuthController,
    CatalogController,
    OrdersController,
    KitchenController,
    RiderController,
    InventoryController,
    PosController,
    StaffController,
    ReportsController,
    AdminController,
    PaymentsController,
    HealthController,
    OperationsController,
  ],
  providers: [
    Db,
    Cache,
    Events,
    Jobs,
    Orders,
    KitchenService,
    DispatchService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
