import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { resolve, sep } from 'path';
import type { Response } from 'express';
import { Db } from '../db';
import { Authed } from '../auth';
import { required, scope } from '../common';
const storage = () => resolve(process.cwd(), 'storage/proofs');
function imageType(buffer: Buffer) {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: 'image/png', extension: 'png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return { mime: 'image/jpeg', extension: 'jpg' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', extension: 'webp' };
  return null;
}
@Controller()
export class ProofController {
  constructor(@Inject(Db) private db: Db) {}
  @Post('rider/orders/:id/proof')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async upload(
    @Req() req: Authed,
    @Param('id') orderId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (req.user.role !== 'RIDER') throw new ForbiddenException();
    const order = required(
      await this.db.order.findFirst({
        where: { id: orderId, riderId: req.user.id, status: { in: ['PICKED_UP', 'ARRIVING'] } },
      }),
    );
    if (!file) throw new BadRequestException('Choose a delivery photo.');
    const type = imageType(file.buffer);
    if (!type) throw new BadRequestException('Only JPEG, PNG or WebP image files are accepted.');
    if ((await this.db.deliveryProof.count({ where: { orderId } })) >= 3)
      throw new BadRequestException('At most three photos may be attached to an order.');
    await mkdir(storage(), { recursive: true });
    const key = `${randomBytes(20).toString('hex')}.${type.extension}`,
      path = resolve(storage(), key);
    await writeFile(path, file.buffer, { flag: 'wx' });
    try {
      const proof = await this.db.atomic(async (tx) => {
        required(
          await tx.order.findFirst({
            where: { id: orderId, riderId: req.user.id, status: { in: ['PICKED_UP', 'ARRIVING'] } },
          }),
        );
        if ((await tx.deliveryProof.count({ where: { orderId } })) >= 3)
          throw new BadRequestException('At most three photos may be attached to an order.');
        return tx.deliveryProof.create({
          data: {
            orderId: order.id,
            riderId: req.user.id,
            storageKey: key,
            mimeType: type.mime,
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
          },
        });
      });
      return { id: proof.id, createdAt: proof.createdAt };
    } catch (error) {
      await unlink(path).catch(() => {});
      throw error;
    }
  }
  @Get('delivery-proofs/:id') async download(
    @Req() req: Authed,
    @Param('id') proofId: string,
    @Res() res: Response,
  ) {
    const proof = required(
      await this.db.deliveryProof.findUnique({
        where: { id: proofId },
        include: { order: { select: { customerId: true, riderId: true, restaurantId: true } } },
      }),
    );
    if (proof.order.customerId !== req.user.id && proof.order.riderId !== req.user.id)
      await scope(this.db, req.user, proof.order.restaurantId, ['RESTAURANT_OWNER', 'MANAGER']);
    const path = resolve(storage(), proof.storageKey);
    if (!path.startsWith(storage() + sep)) throw new ForbiddenException();
    const bytes = await readFile(path).catch(() => {
      throw new BadRequestException('The proof file is unavailable.');
    });
    res.setHeader('Content-Type', proof.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  }
}
