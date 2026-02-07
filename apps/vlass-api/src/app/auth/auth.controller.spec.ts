import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('getCurrentUser', () => {
    it('should return authenticated user info', () => {
      const mockRequest = {
        user: {
          id: 1,
          username: 'testuser',
          email: 'test@github.com',
          full_name: 'Test User',
          github_id: '12345',
          created_at: new Date(),
        },
      };

      const result = controller.getCurrentUser(mockRequest);

      expect(result).toEqual({
        authenticated: true,
        user: {
          id: 1,
          username: 'testuser',
          email: 'test@github.com',
          full_name: 'Test User',
          github_id: '12345',
          created_at: expect.any(Date),
        },
      });
    });

    it('should return unauthenticated status if no user', () => {
      const mockRequest = { user: null };

      const result = controller.getCurrentUser(mockRequest);

      expect(result).toEqual({ authenticated: false });
    });
  });

  describe('logout', () => {
    it('should logout user and clear session', (done) => {
      const mockRequest = {
        logout: jest.fn().mockImplementation((callback: (err: Error | null) => void) => {
          callback(null);
        }),
      };

      const mockResponse = {
        json: jest.fn().mockImplementation((data) => {
          expect(data).toEqual({ message: 'Logged out successfully' });
          expect(mockRequest.logout).toHaveBeenCalled();
          done();
        }),
      };

      controller.logout(mockRequest, mockResponse);
    });

    it('should throw error if logout fails', (done) => {
      const error = new Error('Logout failed');
      const mockRequest = {
        logout: jest.fn().mockImplementation((callback: (err: Error | null) => void) => {
          callback(error);
        }),
      };

      const mockResponse = {};

      expect(() => {
        controller.logout(mockRequest, mockResponse);
      }).toThrow('Logout failed');
      done();
    });
  });
});
