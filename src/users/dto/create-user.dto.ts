import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export const GLOBAL_ROLES = [
  'owner',
  'admin',
  'accountant',
  'operator',
] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

// 'owner' exclus deliberat — fix logic-reviewer (audit holistic): fără
// asta, orice 'admin' putea crea direct un cont nou cu role:'owner' prin
// POST /users, ocolind complet verificarea „doar un owner poate acorda
// owner" adăugată în UsersService.update(). Un owner nou se obține DOAR
// prin promovarea (PATCH /users/:id) unui user existent de către un owner
// deja existent, niciodată la creare — invariant mai simplu de apărat
// decât să repete aceeași verificare de apelant și în create().
export const CREATABLE_ROLES = GLOBAL_ROLES.filter((role) => role !== 'owner');
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export class CreateUserDto {
  @IsEmail()
  email!: string;

  /**
   * Parolă inițială setată direct de owner/admin la creare (nu invite-
   * token + email — Resend/e-mail de bun venit rămâne un pas separat,
   * nespecificat încă; de adăugat când devine cerință explicită, nu
   * speculativ acum).
   */
  @IsString()
  @Length(8, 72) // 72 = limita bcrypt, la fel ca implicit în AuthService
  password!: string;

  @IsString()
  @Length(1, 255)
  fullName!: string;

  @IsOptional()
  @IsIn(CREATABLE_ROLES, {
    message: `role trebuie să fie unul din: ${CREATABLE_ROLES.join(', ')} (owner se acordă doar prin promovare, PATCH /users/:id).`,
  })
  role?: CreatableRole;
}
