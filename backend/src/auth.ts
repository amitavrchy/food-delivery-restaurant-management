import { Body, CanActivate, Controller, ExecutionContext, Get, Inject, Injectable, Post, Req, Res, SetMetadata, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { compare, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { Db } from './db';
import { Actor, parse } from './common';
export const Public = () => SetMetadata('public', true);
export type Authed = Request & {user:Actor};
export function tokenActor(token:string): {sub:string} { return verify(token,process.env.JWT_SECRET!,{algorithms:['HS256'],issuer:'tablelane'}) as {sub:string}; }
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Db) private db:Db, @Inject(Reflector) private reflector:Reflector) {}
  async canActivate(ctx:ExecutionContext) {
    if (this.reflector.getAllAndOverride('public',[ctx.getHandler(),ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Authed>();
    try {
      const token = req.cookies?.session || req.headers.authorization?.replace(/^Bearer /,'');
      const claims = tokenActor(token || '');
      const user = await this.db.user.findUnique({where:{id:claims.sub}});
      if (!user) throw new Error();
      req.user = {id:user.id,role:user.role,name:user.name,email:user.email};
      return true;
    } catch { throw new UnauthorizedException('Please sign in to continue.'); }
  }
}
@Controller('auth')
export class AuthController {
  constructor(@Inject(Db) private db:Db) {}
  private session(user:Actor,res:Response) {
    res.cookie('session',sign({sub:user.id},process.env.JWT_SECRET!,{expiresIn:'12h',issuer:'tablelane',algorithm:'HS256'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:43200000,path:'/'});
    return {id:user.id,email:user.email,name:user.name,role:user.role};
  }
  @Public() @Post('login') async login(@Body() body:unknown,@Res({passthrough:true}) res:Response) {
    const data = parse(z.object({email:z.email().max(200).transform(s=>s.toLowerCase()),password:z.string().min(1).max(128)}),body);
    const user = await this.db.user.findUnique({where:{email:data.email}});
    if (!user || !await compare(data.password,user.passwordHash)) throw new UnauthorizedException('Email or password is incorrect.');
    return this.session(user,res);
  }
  @Public() @Post('register') async register(@Body() body:unknown,@Res({passthrough:true}) res:Response) {
    const data = parse(z.object({name:z.string().trim().min(2).max(80),email:z.email().max(200).transform(s=>s.toLowerCase()),password:z.string().min(10).max(128)}),body);
    if (await this.db.user.findUnique({where:{email:data.email}})) throw new ConflictException('Email is already registered.');
    const user = await this.db.user.create({data:{name:data.name,email:data.email,passwordHash:await hash(data.password,12)}});
    return this.session(user,res);
  }
  @Get('me') async me(@Req() req:Authed) {
    return {...req.user,memberships:await this.db.userRestaurantRole.findMany({where:{userId:req.user.id},include:{restaurant:true}})};
  }
  @Post('logout') logout(@Res({passthrough:true}) res:Response) { res.clearCookie('session',{path:'/'}); return {ok:true}; }
  @Public() @Get('demo') demo() {
    if (process.env.DEMO_SEED !== 'true') throw new ForbiddenException();
    return {enabled:true,accounts:[{email:'owner@tablelane.demo',label:'Restaurant owner'},{email:'customer@tablelane.demo',label:'Customer'},{email:'rider@tablelane.demo',label:'Delivery rider'},{email:'admin@tablelane.demo',label:'Platform admin'}]};
  }
}
