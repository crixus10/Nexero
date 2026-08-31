import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { GLOBAL_ROLES, type GlobalRole } from './create-user.dto';

/**
 * email NU apare aici, deliberat — schimbarea de email a unui user
 * existent nu e specificată încă (implică re-verificare, impact pe
 * `users.email` UNIQUE global); de adăugat când devine cerință explicită.
 * password NU apare aici — vezi POST /users/:id/reset-password.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fullName?: string;

  @IsOptional()
  @IsIn(GLOBAL_ROLES, {
    message: `role trebuie să fie unul din: ${GLOBAL_ROLES.join(', ')}.`,
  })
  role?: GlobalRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
