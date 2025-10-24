import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment } from '../types';
import { getPostWithAssignments } from '../services/postService';
import { ArrowLeftIcon } from '../components/Icons';

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        if (!postId) {
            setError("Post ID not found.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const { post: postData, assignments: assignmentsData } = await getPostWithAssignments(postId);
            setPost(postData);
            setAssignments(assignmentsData);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch post details.');
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (isLoading) {
        return <div className="text-center p-8">Loading post details...</div>;
    }

    if (error) {
        return <div className="text-red-500 text-center p-8">{error}</div>;
    }

    if (!post) {
        return <div className="text-center p-8">Post not found.</div>;
    }

    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Back to Posts</span>
            </button>
            <div className="bg-secondary p-6 rounded-lg shadow-lg">
                <h1 className="text-3xl font-bold">{post.campaignName}</h1>
                {post.eventName && <p className="text-xl text-primary">{post.eventName}</p>}
                <div className="mt-2 text-sm text-gray-400">
                    <p>Created on: {formatDate(post.createdAt)}</p>
                    <p>Status: <span className={post.isActive ? 'text-green-400' : 'text-red-400'}>{post.isActive ? 'Active' : 'Inactive'}</span></p>
                </div>

                <div className="mt-6 border-t border-gray-700 pt-4">
                    <h2 className="text-2xl font-bold mt-4">Assignments ({assignments.length})</h2>
                    <div className="mt-4 space-y-2">
                        {assignments.map(a => (
                            <div key={a.id} className="bg-dark/70 p-3 rounded-md flex justify-between items-center">
                                <span>{a.promoterName}</span>
                                <span className="text-sm capitalize">{a.status}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
