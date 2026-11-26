import type { HttpTransport, User } from '../interfaces';

export class UsersApi {
  constructor(private readonly client: HttpTransport) {}

  getUsers(): Promise<User[]> {
    return this.client.get<User[]>('/users');
  }

  getUser(userId: number): Promise<User> {
    return this.client.get<User>(`/users/${userId}`);
  }

  getCurrentUser(): Promise<User> {
    return this.client.get<User>('/users/current');
  }

  searchUsers(query: string): Promise<User[]> {
    return this.client.get<User[]>('/users', { search: query });
  }
}
