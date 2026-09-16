export interface AuthUser {
  id: number;
  email: string;
}

export interface JwtPayload {
  sub: number; // user id
  email: string;
}
