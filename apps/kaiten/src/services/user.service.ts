import { inject, injectable } from 'inversify';
import type { KaitenApiPort, User } from '../kaiten';
import { TOKENS } from '../di/tokens';

@injectable()
export class UserService {
  constructor(@inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort) {}

  async findUser(query: string): Promise<User> {
    const users = await this.api.users.searchUsers(query);
    if (users.length === 0) {
      throw new Error(`User "${query}" not found`);
    }
    return users[0]!;
  }

  getCurrentUser(): Promise<User> {
    return this.api.users.getCurrentUser();
  }

  getUsers(): Promise<User[]> {
    return this.api.users.getUsers();
  }
}
