import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PostsApiService } from './posts-api.service';

describe('PostsApiService', () => {
  let service: PostsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  const configure = (platformId: 'browser' | 'server'): void => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PostsApiService,
        { provide: PLATFORM_ID, useValue: platformId },
      ],
    });

    service = TestBed.inject(PostsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  };

  it('gets published posts with bearer token in browser mode', () => {
    configure('browser');
    sessionStorage.setItem('auth_token', 'token-123');

    service.getPublishedPosts().subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/posts/published');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush([]);
  });

  it('gets a post by id and URL-encodes identifier', () => {
    configure('browser');
    sessionStorage.setItem('auth_token', 'token-123');

    service.getPostById('post/id').subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/posts/post%2Fid');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('creates a post via POST', () => {
    configure('browser');
    sessionStorage.setItem('auth_token', 'token-123');

    service.createPost({ title: 'Title', content: 'Body content for post.' }).subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/posts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Title', content: 'Body content for post.' });
    req.flush({});
  });

  it('updates a post via PUT', () => {
    configure('browser');
    sessionStorage.setItem('auth_token', 'token-123');

    service.updatePost('post-1', { title: 'Updated' }).subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/posts/post-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ title: 'Updated' });
    req.flush({});
  });

  it('publishes a post via POST to /publish', () => {
    configure('browser');
    sessionStorage.setItem('auth_token', 'token-123');

    service.publishPost('post-1').subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/posts/post-1/publish');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('omits auth header in server mode', () => {
    configure('server');
    sessionStorage.setItem('auth_token', 'token-123');

    service.getPublishedPosts().subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/posts/published');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('hides and locks post through moderation endpoints', () => {
    configure('browser');
    sessionStorage.setItem('auth_token', 'token-123');

    service.hidePost('post-1').subscribe();
    service.lockPost('post-1').subscribe();

    const hideReq = httpMock.expectOne('http://localhost:3000/api/posts/post-1/hide');
    expect(hideReq.request.method).toBe('POST');
    hideReq.flush({});

    const lockReq = httpMock.expectOne('http://localhost:3000/api/posts/post-1/lock');
    expect(lockReq.request.method).toBe('POST');
    lockReq.flush({});
  });
});
