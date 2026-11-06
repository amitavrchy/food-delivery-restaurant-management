CREATE EXTENSION IF NOT EXISTS postgis;

CREATE UNIQUE INDEX "TableCheck_one_open_per_table" ON "TableCheck"("tableId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "Shift_one_open_per_user" ON "Shift"("userId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "RiderOffer_one_sent_per_rider_order" ON "RiderOffer"("orderId", "riderId") WHERE "status" = 'SENT';

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_nonnegative" CHECK ("qtyOnHand" >= 0 AND "lowStockQty" >= 0 AND "costMinor" >= 0);
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_positive" CHECK ("qty" > 0);
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_valid_price_schedule" CHECK ("priceMinor" >= 0 AND "prepMinutes" > 0 AND "availableFrom" >= 0 AND "availableUntil" <= 24 AND "availableFrom" < "availableUntil");
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_valid_quantity" CHECK ("qty" > 0 AND "unitPriceMinor" >= 0 AND "seat" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_consistent_totals" CHECK ("goodsMinor" >= 0 AND "discountMinor" >= 0 AND "discountMinor" <= "goodsMinor" AND "taxMinor" >= 0 AND "serviceMinor" >= 0 AND "tipMinor" >= 0 AND "deliveryFeeMinor" >= 0 AND "grandMinor" = "goodsMinor" - "discountMinor" + "taxMinor" + "serviceMinor" + "tipMinor" + "deliveryFeeMinor");
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_stars_range" CHECK ("stars" BETWEEN 1 AND 5);
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_policy_range" CHECK ("commissionBps" BETWEEN 0 AND 5000 AND "lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);

CREATE INDEX "Restaurant_geo" ON "Restaurant" USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography));
